import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface RealtimeSpeechOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
}

export const useRealtimeSpeechRecognition = (options: RealtimeSpeechOptions = {}) => {
  const {
    language = 'fa-IR',
    continuous = true,
    interimResults = true,
    onResult,
    onError,
    onEnd
  } = options;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    isSupported: false,
    error: null,
  });

  const recognitionRef = useRef<any>(null);
  // Callers pass inline callbacks; keep the latest ones in a ref so the recognizer
  // is not rebuilt (and state not reset) on every render.
  const callbacksRef = useRef({ onResult, onError, onEnd });
  callbacksRef.current = { onResult, onError, onEnd };

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setState(prev => (prev.isSupported ? prev : { ...prev, isSupported: true }));
      
      const recognition = new SpeechRecognition();
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.lang = language;
      recognition.maxAlternatives = 3;

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interimText += transcript;
          }
        }

        if (finalText) {
          setState(prev => ({
            ...prev,
            transcript: prev.transcript + finalText,
            interimTranscript: '',
          }));
          callbacksRef.current.onResult?.(finalText.trim(), true);
        } else if (interimText) {
          setState(prev => ({
            ...prev,
            interimTranscript: interimText,
          }));
          callbacksRef.current.onResult?.(interimText.trim(), false);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        let errorMsg = 'خطا در تشخیص گفتار';
        
        switch (event.error) {
          case 'no-speech':
            errorMsg = 'هیچ صدایی شنیده نشد. لطفاً دوباره تلاش کنید.';
            break;
          case 'audio-capture':
            errorMsg = 'میکروفون در دسترس نیست.';
            break;
          case 'not-allowed':
            errorMsg = 'دسترسی به میکروفون مسدود شده است.';
            break;
          case 'network':
            errorMsg = 'خطای شبکه. لطفاً اتصال اینترنت خود را بررسی کنید.';
            break;
        }

        setState(prev => ({
          ...prev,
          error: errorMsg,
          isListening: false,
        }));
        
        callbacksRef.current.onError?.(errorMsg);
        
        toast({
          title: 'خطا در تشخیص گفتار',
          description: errorMsg,
          variant: 'destructive',
        });
      };

      recognition.onend = () => {
        setState(prev => ({ ...prev, isListening: false }));
        callbacksRef.current.onEnd?.();
      };

      recognitionRef.current = recognition;
    } else {
      const unsupported = 'مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند.';
      setState(prev => (!prev.isSupported && prev.error === unsupported
        ? prev
        : { ...prev, isSupported: false, error: unsupported }));
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [language, continuous, interimResults]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      toast({
        title: 'خطا',
        description: 'تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        isListening: true,
        error: null,
      }));
      recognitionRef.current.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      setState(prev => ({ ...prev, isListening: false }));
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error('Failed to stop recognition:', error);
      }
      setState(prev => ({ ...prev, isListening: false }));
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setState(prev => ({
      ...prev,
      transcript: '',
      interimTranscript: '',
    }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    resetTranscript,
  };
};
