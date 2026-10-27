/**
 * Wake word detection.
 *
 * Porcupine (on-device) runs when an access key and a trained keyword file are configured:
 *   VITE_PICOVOICE_ACCESS_KEY  access key from console.picovoice.ai
 *   VITE_WAKE_WORD_MODEL       keyword file (.ppn, Web platform) under public/, e.g. /models/hey-second-brain.ppn
 *   VITE_WAKE_WORD_PHRASE      the phrase as spoken, shown to the user, e.g. «Hey Second Brain»
 *   VITE_PORCUPINE_PARAMS      Porcupine's language model, default /models/porcupine_params.pv
 * Porcupine has no Persian model, so its phrase is English. Otherwise the Web Speech API listens
 * for the Persian phrases «هی دستیار» / «سلام دستیار».
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

// Types from Porcupine
type PorcupineInstance = {
  process: (pcm: Int16Array) => Promise<void>;
  release: () => Promise<void>;
};

type WakeWordStatus = 
  | 'idle'
  | 'loading'
  | 'listening'
  | 'detected'
  | 'error'
  | 'unsupported'
  | 'fallback';

interface UseWakeWordOptions {
  accessKey?: string;
  keywordPath?: string;
  keywordPhrase?: string;
  paramsPath?: string;
  onWakeWord?: () => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
  fallbackEnabled?: boolean;
}

interface UseWakeWordReturn {
  status: WakeWordStatus;
  error: string | null;
  isListening: boolean;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  useFallback: boolean;
}

// Fallback: Web Speech API keyword detection
function useFallbackWakeWord(
  enabled: boolean,
  onDetected: () => void
): { isListening: boolean; start: () => void; stop: () => void } {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(isListening);
  // The caller's callback changes every render; reading it from a ref keeps the
  // recognizer alive instead of rebuilding it on each render.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (!enabled) return;

    const SpeechRecognition = (window as any).SpeechRecognition || 
                              (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fa-IR';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        
        // Check for wake word variations
        const wakeWords = [
          'هی دستیار',
          'سلام دستیار',
          'hey assistant',
          // Earlier name of the app, still recognised for people used to it
          'هی مورا',
          'سلام مورا',
          'hey mora'
        ];
        
        if (wakeWords.some(w => transcript.includes(w.toLowerCase()))) {
          onDetectedRef.current();
          break;
        }
      }
    };

    recognition.onend = () => {
      // Auto-restart for continuous listening
      if (isListeningRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch {
            // Ignore
          }
        }, 100);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[WakeWord Fallback] Error:', event.error);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // Ignore
      }
    };
  }, [enabled]);

  const start = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        // Already started
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    setIsListening(false);
  }, []);

  return { isListening, start, stop };
}

export function useWakeWord(options: UseWakeWordOptions = {}): UseWakeWordReturn {
  const {
    accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY,
    keywordPath = import.meta.env.VITE_WAKE_WORD_MODEL,
    keywordPhrase = import.meta.env.VITE_WAKE_WORD_PHRASE || 'Hey Second Brain',
    paramsPath = import.meta.env.VITE_PORCUPINE_PARAMS || '/models/porcupine_params.pv',
    onWakeWord,
    onError,
    autoStart = false,
    fallbackEnabled = true,
  } = options;

  const [status, setStatus] = useState<WakeWordStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  
  const porcupineRef = useRef<PorcupineInstance | null>(null);
  const isInitializing = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 3;

  // Fallback wake word detection
  const fallback = useFallbackWakeWord(
    useFallback && fallbackEnabled,
    () => {
      setStatus('detected');
      onWakeWord?.();
      
      // Reset to listening after detection
      setTimeout(() => {
        if (useFallback) setStatus('fallback');
      }, 1000);
    }
  );

  // Cleanup function
  const cleanup = useCallback(async () => {
    try {
      if (porcupineRef.current) {
        await porcupineRef.current.release();
        porcupineRef.current = null;
      }
      
      // Unsubscribe from WebVoiceProcessor
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');
      await WebVoiceProcessor.reset();
    } catch (e) {
      console.warn('[WakeWord] Cleanup error:', e);
    }
  }, []);

  // Initialize Porcupine
  const initializePorcupine = useCallback(async () => {
    if (isInitializing.current) return;
    if (!accessKey || !keywordPath) {
      console.info('[WakeWord] Porcupine is not configured, listening with Web Speech');
      setUseFallback(true);
      setStatus('fallback');
      fallback.start();
      return;
    }

    isInitializing.current = true;
    setStatus('loading');
    setError(null);

    try {
      // Dynamic imports
      const { Porcupine, BuiltInKeyword } = await import('@picovoice/porcupine-web');
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor');

      await cleanup();

      // Detection callback
      const detectionCallback = (detection: { label: string; index: number }) => {
        console.log('[WakeWord] Detected:', detection.label);
        setStatus('detected');
        onWakeWord?.();
        
        // Reset to listening after brief detection state
        setTimeout(() => setStatus('listening'), 1000);
      };

      const porcupine = await Porcupine.create(
        accessKey,
        { publicPath: keywordPath, label: keywordPhrase },
        detectionCallback,
        { publicPath: paramsPath }
      );

      porcupineRef.current = porcupine;

      // Subscribe to voice processor
      await WebVoiceProcessor.subscribe(porcupine as any);

      setStatus('listening');
      retryCount.current = 0;
      
      console.log(`[WakeWord] Porcupine listening for "${keywordPhrase}"`);
      toast({
        title: 'دستیار صوتی فعال شد',
        description: `برای صدا زدن دستیار بگویید «${keywordPhrase}»`,
      });

    } catch (err) {
      console.error('[WakeWord] Init error:', err);
      const errorMsg = err instanceof Error ? err.message : 'خطا در راه‌اندازی';
      setError(errorMsg);
      onError?.(errorMsg);

      // Retry with exponential backoff
      if (retryCount.current < maxRetries) {
        retryCount.current++;
        const delay = Math.min(200 * Math.pow(2, retryCount.current), 800);
        console.log(`[WakeWord] Retrying in ${delay}ms...`);
        setTimeout(() => {
          isInitializing.current = false;
          initializePorcupine();
        }, delay);
        return;
      }

      // Fall back to Web Speech
      if (fallbackEnabled) {
        console.log('[WakeWord] Falling back to Web Speech API');
        setUseFallback(true);
        setStatus('fallback');
        fallback.start();
        toast({
          title: 'دستیار صوتی فعال شد',
          description: 'برای صدا زدن دستیار بگویید «هی دستیار»',
        });
      } else {
        setStatus('error');
      }
    } finally {
      isInitializing.current = false;
    }
  }, [accessKey, keywordPath, keywordPhrase, paramsPath, cleanup, fallbackEnabled, onError, onWakeWord, fallback]);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (autoStart) {
      initializePorcupine();
    }

    return () => {
      cleanup();
      fallback.stop();
    };
  }, [autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start listening
  const start = useCallback(async () => {
    if (useFallback) {
      fallback.start();
      setStatus('fallback');
    } else if (!porcupineRef.current) {
      await initializePorcupine();
    } else {
      setStatus('listening');
    }
  }, [useFallback, fallback, initializePorcupine]);

  // Stop listening
  const stop = useCallback(() => {
    cleanup();
    fallback.stop();
    setStatus('idle');
  }, [cleanup, fallback]);

  const isListening = status === 'listening' || status === 'fallback' || fallback.isListening;
  const isSupported = typeof window !== 'undefined' && 
                      ('AudioContext' in window || 'webkitAudioContext' in (window as any));

  return {
    status,
    error,
    isListening,
    isSupported,
    start,
    stop,
    useFallback,
  };
}
