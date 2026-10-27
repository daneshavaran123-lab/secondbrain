/**
 * Assistant panel of «مغز دوم من».
 * Sends the conversation to the backend agent, runs the actions it returns
 * (automatically, or after the user confirms) and shows what happened.
 */

import { useState, useRef, useEffect, useCallback, ChangeEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  ArrowUp,
  Mic,
  MicOff,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Table,
  Music,
  Video,
  AudioLines,
  BarChart3,
  SquarePen,
  Search,
  CalendarDays,
  ListTodo,
  Lightbulb,
  Ban,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { ASSISTANT_ASK_EVENT, AssistantAskDetail } from '@/lib/assistant';
import { actionExecutor, AssistantAction, ActionResult } from '@/services/actionExecutorService';
import { offlineStorage } from '@/services/offlineStorageService';
import { fileProcessor, ProcessedFile } from '@/services/fileProcessorService';
import { logAssistantAction } from '@/services/assistantLogService';
import { useOffline } from '@/hooks/useOffline';
import { useRealtimeSpeechRecognition } from '@/hooks/useRealtimeSpeechRecognition';
import { usePersianTTS } from '@/hooks/usePersianTTS';
import { useAuth } from '@/contexts/AuthContext';
import { MoraVoiceAssistant } from './MoraVoiceAssistant';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@/lib/utils';

type ActionState = 'running' | 'done' | 'failed' | 'awaiting' | 'dismissed';

interface ActionView extends AssistantAction {
  id: string;
  state: ActionState;
  resultMessage?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ActionView[];
  steps?: Array<{ tool: string; label: string }>;
  questions?: Array<{ question: string; options?: string[]; field?: string }>;
  isLoading?: boolean;
  isError?: boolean;
  attachment?: { fileName: string; type: string };
}

interface SmartAssistantProps {
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SESSION_ID = 'current';
const HISTORY_FOR_AGENT = 16;

const SUGGESTIONS = [
  { icon: CalendarDays, text: 'برنامه امروزم چیه؟', send: true },
  { icon: ListTodo, text: 'چه کارهایی عقب افتاده؟', send: true },
  { icon: Lightbulb, text: 'یه ایده دارم: ', send: false },
  { icon: Search, text: 'درباره ', hint: 'درباره … چی نوشته بودم؟', send: false },
];

const STATE_WORD: Record<ActionState, string> = {
  running: 'در حال انجام',
  done: 'انجام شد',
  failed: 'ناموفق',
  awaiting: 'منتظر تأیید',
  dismissed: 'رد شد',
};

const toStoredStatus = (state: ActionState): AssistantAction['status'] =>
  state === 'done' ? 'completed' : state === 'awaiting' ? 'needs_confirmation' : 'failed';

const fromStoredStatus = (status: string, error?: string): ActionState =>
  status === 'completed' ? 'done'
    : status === 'needs_confirmation' ? 'awaiting'
    : status === 'failed' && error !== 'dismissed' ? 'failed'
    : 'dismissed';

/** What the agent needs to know about earlier turns, including how actions ended. */
function historyForAgent(messages: Message[]) {
  return messages
    .filter((m) => !m.isLoading && !m.isError && m.content)
    .slice(-HISTORY_FOR_AGENT)
    .map((m) => {
      if (m.role !== 'assistant' || !m.actions?.length) return { role: m.role, content: m.content };
      const outcome = m.actions
        .map((a) => `${STATE_WORD[a.state]}: ${a.feedback?.details || a.function}${a.state === 'failed' && a.resultMessage ? ` (${a.resultMessage})` : ''}`)
        .join('؛ ');
      return { role: m.role, content: `${m.content}\n\n[نتیجه اقدامات: ${outcome}]` };
    });
}

const plainText = (md: string) =>
  md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#>|]+/g, ' ').replace(/\s+/g, ' ').trim();

function getContext() {
  const now = new Date();
  return {
    currentDate: new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now),
    currentTime: new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    page: typeof document !== 'undefined' ? document.title : undefined,
  };
}

function FileIcon({ type, className }: { type: string; className?: string }) {
  const Icon = type === 'image' ? ImageIcon
    : type === 'pdf' ? FileText
    : type === 'excel' || type === 'csv' ? Table
    : type === 'audio' ? Music
    : type === 'video' ? Video
    : Paperclip;
  return <Icon className={className} />;
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5 marker:text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5 marker:text-muted-foreground">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>
        ),
        h1: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        h2: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        h3: ({ children }) => <h3 className="mb-1 mt-3 text-sm font-semibold">{children}</h3>,
        code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>,
        blockquote: ({ children }) => <blockquote className="my-2 border-s-2 border-border ps-3 text-muted-foreground">{children}</blockquote>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border-b border-border bg-muted/50 px-2 py-1.5 text-start font-medium">{children}</th>,
        td: ({ children }) => <td className="border-b border-border/60 px-2 py-1.5">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function ActionRow({
  action,
  disabled,
  onConfirm,
  onDismiss,
}: {
  action: ActionView;
  disabled: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { state } = action;
  const icon = {
    running: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    done: <Check className="h-3.5 w-3.5" />,
    failed: <AlertCircle className="h-3.5 w-3.5" />,
    awaiting: <Clock className="h-3.5 w-3.5" />,
    dismissed: <Ban className="h-3.5 w-3.5" />,
  }[state];
  const isRead = /^(get|search)_/.test(action.function);
  const detail = (state === 'failed' || (state === 'done' && isRead)) && action.resultMessage
    ? action.resultMessage
    : action.feedback?.details;

  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5 text-xs transition-colors',
      state === 'awaiting' ? 'border-signal/40 bg-signal-soft' : 'border-border bg-muted/40',
      state === 'dismissed' && 'opacity-60'
    )}>
      <div className="flex items-start gap-2.5">
        <span className={cn(
          'mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          state === 'done' && 'bg-success/15 text-success',
          state === 'failed' && 'bg-destructive/10 text-destructive',
          state === 'awaiting' && 'bg-signal/15 text-signal',
          state === 'running' && 'bg-signal/10 text-signal',
          state === 'dismissed' && 'bg-muted text-muted-foreground'
        )}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {action.feedback?.location || 'اقدام'}
            <span className="font-normal text-muted-foreground"> · {STATE_WORD[state]}</span>
          </p>
          {detail && <p className="mt-0.5 whitespace-pre-wrap break-words leading-5 text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {state === 'awaiting' && (
        <div className="mt-2.5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-8 rounded-lg px-3 text-xs" onClick={onDismiss} disabled={disabled}>
            نه، ممنون
          </Button>
          <Button size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={onConfirm} disabled={disabled}>
            تأیید و انجام
          </Button>
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground" role="status">
      <BrandMark size={16} active className="text-foreground" />
      در حال فکر کردن…
    </div>
  );
}

export function SmartAssistant({ className, isOpen: externalIsOpen, onOpenChange }: SmartAssistantProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen ?? internalIsOpen;
  const setIsOpen = useCallback((open: boolean) => {
    if (onOpenChange) onOpenChange(open);
    else setInternalIsOpen(open);
  }, [onOpenChange]);

  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const tts = usePersianTTS();

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<ProcessedFile | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isListening,
    interimTranscript,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useRealtimeSpeechRecognition({
    language: 'fa-IR',
    continuous: true,
    interimResults: true,
    onResult: (text, isFinal) => {
      if (isFinal && text.trim()) setInput((prev) => (prev ? `${prev} ${text}` : text));
    },
  });

  // Restore the last conversation (stored newest-first). Anything sent while it loads
  // (an ask from the home screen right after start-up) stays after the restored history.
  useEffect(() => {
    offlineStorage.getRecentHistory(30).then((history) => {
      const restored: Message[] = history.reverse().map((h) => ({
        id: h.id,
        role: h.role,
        content: h.content,
        timestamp: new Date(h.timestamp),
        actions: h.actions?.map((a, i) => ({
          id: `${h.id}-${i}`,
          function: a.function || a.type || '',
          params: a.params,
          status: a.status,
          feedback: (a.result as { feedback?: ActionView['feedback'] } | undefined)?.feedback,
          resultMessage: a.error && a.error !== 'dismissed' ? a.error : undefined,
          state: fromStoredStatus(a.status, a.error),
        })),
      }));
      setMessages((current) => {
        const live = new Set(current.map((m) => m.id));
        return [...restored.filter((m) => !live.has(m.id)), ...current];
      });
    }).catch(() => {}).finally(() => setHistoryLoaded(true));
  }, []);

  // Persist the conversation (debounced) so it survives reloads.
  useEffect(() => {
    if (!historyLoaded) return;
    const timer = setTimeout(() => {
      for (const m of messages.slice(-30)) {
        if (m.isLoading || m.isError) continue;
        offlineStorage.saveMessage({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp.toISOString(),
          sessionId: SESSION_ID,
          actions: m.actions?.map((a) => ({
            function: a.function,
            params: a.params,
            status: toStoredStatus(a.state),
            result: { feedback: a.feedback },
            error: a.state === 'dismissed' ? 'dismissed' : a.state === 'failed' ? a.resultMessage : undefined,
          })),
        }).catch(() => {});
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [messages, historyLoaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setIsOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, setIsOpen]);

  // Auto-grow the composer.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const updateAction = useCallback((messageId: string, actionId: string, patch: Partial<ActionView>) => {
    setMessages((prev) => prev.map((m) => m.id !== messageId ? m : {
      ...m,
      actions: m.actions?.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
    }));
  }, []);

  const runAction = useCallback(async (messageId: string, action: ActionView) => {
    updateAction(messageId, action.id, { state: 'running' });
    let result: ActionResult;
    try {
      result = await actionExecutor.executeAction(action);
    } catch (error) {
      result = { success: false, message: error instanceof Error ? error.message : 'خطای ناشناخته' };
    }

    logAssistantAction({
      action_type: action.function,
      summary: result.message || `اجرای ${action.function}`,
      domain: (action.params as { domain?: string })?.domain ?? null,
      target_table: null,
      target_id: null,
      payload: { params: action.params, result: { success: result.success, location: result.location } },
      status: result.success ? 'success' : 'failed',
      error_message: result.success ? null : result.message,
    });

    updateAction(messageId, action.id, { state: result.success ? 'done' : 'failed', resultMessage: result.message });
  }, [updateAction]);

  const clearAttachment = useCallback(() => {
    setAttachedFile((file) => {
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return null;
    });
  }, []);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if ((!text && !attachedFile) || isLoading) return;

    if (isListening) stopListening();
    const content = text || `فایل ضمیمه: ${attachedFile?.fileName}`;
    const history = historyForAgent(messagesRef.current);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      attachment: attachedFile ? { fileName: attachedFile.fileName, type: attachedFile.type } : undefined,
    };
    const replyId = crypto.randomUUID();

    if (!isOnline) {
      setMessages((prev) => [...prev, userMessage, {
        id: replyId, role: 'assistant', timestamp: new Date(), isError: true,
        content: 'برای گفتگو با دستیار به اینترنت نیاز است. پیامتان را بعد از اتصال دوباره بفرستید.',
      }]);
      return;
    }

    const attachment = attachedFile ? {
      fileName: attachedFile.fileName,
      type: attachedFile.type,
      content: attachedFile.text || JSON.stringify(attachedFile.data),
      summary: attachedFile.summary,
    } : null;

    setMessages((prev) => [...prev, userMessage, { id: replyId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true }]);
    setInput('');
    resetTranscript();
    clearAttachment();
    setIsLoading(true);

    try {
      const res = await apiFetch('/smart-assistant', {
        method: 'POST',
        body: JSON.stringify({ message: content, conversationHistory: history, context: getContext(), attachment }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('نشست شما منقضی شده؛ لطفاً دوباره وارد شوید.');
      if (!res.ok) throw new Error(data.error || data.message || 'ارتباط با دستیار برقرار نشد. دوباره امتحان کنید.');

      const actions: ActionView[] = (data.actions || []).map((a: AssistantAction & { id?: string }, i: number) => ({
        ...a,
        id: a.id || `${replyId}-${i}`,
        state: a.status === 'needs_confirmation' ? 'awaiting' : 'running',
      }));
      const reply: Message = {
        id: replyId,
        role: 'assistant',
        content: data.message || '',
        timestamp: new Date(),
        actions,
        steps: data.steps,
        questions: data.questions,
      };
      setMessages((prev) => prev.map((m) => (m.id === replyId ? reply : m)));

      if (tts.isEnabled && reply.content) tts.speak(plainText(reply.content));

      for (const action of actions) {
        if (action.state === 'running') await runAction(replyId, action);
      }
    } catch (error) {
      setMessages((prev) => prev.map((m) => m.id !== replyId ? m : {
        id: replyId,
        role: 'assistant',
        timestamp: new Date(),
        isError: true,
        content: error instanceof Error ? error.message : 'متأسفانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.',
      }));
    } finally {
      setIsLoading(false);
    }
  }, [attachedFile, isLoading, isListening, stopListening, isOnline, resetTranscript, clearAttachment, tts, runAction]);

  // Let other parts of the app open the assistant or ask it something.
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const { text = '', send = true } = (e as CustomEvent<AssistantAskDetail>).detail || {};
      setIsOpen(true);
      if (send && text.trim()) sendRef.current(text);
      else if (text) setInput(text);
    };
    window.addEventListener(ASSISTANT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASSISTANT_ASK_EVENT, onAsk);
  }, [setIsOpen]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    try {
      setAttachedFile(await fileProcessor.processFile(file));
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        isError: true,
        timestamp: new Date(),
        content: `پردازش فایل ممکن نشد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
      }]);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewChat = async () => {
    tts.stop();
    setMessages([]);
    setInput('');
    clearAttachment();
    await offlineStorage.clearSessionHistory(SESSION_ID).catch(() => {});
    inputRef.current?.focus();
  };

  const pickSuggestion = (s: (typeof SUGGESTIONS)[number]) => {
    if (s.send) {
      sendMessage(s.text);
    } else {
      setInput(s.text);
      inputRef.current?.focus();
    }
  };

  const firstName = user?.first_name || user?.display_name?.split(' ')[0] || '';
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const status = !isOnline ? 'آفلاین' : isLoading ? 'در حال فکر کردن…' : tts.isSpeaking ? 'در حال صحبت' : 'آماده';

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            aria-label="دستیار مغز دوم من"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'fixed z-[60] flex flex-col overflow-hidden bg-background text-foreground',
              'inset-0 sm:inset-auto sm:bottom-6 sm:left-6',
              'sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[420px]',
              'sm:rounded-xl sm:border sm:border-border sm:shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.35)]'
            )}
          >
            {/* Header */}
            <header
              className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"
              style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark size={28} active={isLoading} className="text-foreground" />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-5">دستیار</h2>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                    <span className={cn('h-1.5 w-1.5 rounded-full', !isOnline ? 'bg-muted-foreground' : isLoading ? 'bg-signal' : 'bg-success')} />
                    {status}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-10 w-10 min-h-0 rounded-lg text-muted-foreground sm:h-9 sm:w-9" onClick={startNewChat} title="گفتگوی جدید" aria-label="گفتگوی جدید" disabled={isLoading}>
                  <SquarePen className="h-[18px] w-[18px]" />
                </Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 min-h-0 rounded-lg text-muted-foreground sm:h-9 sm:w-9" onClick={() => setIsVoiceMode(true)} title="حالت صوتی" aria-label="حالت صوتی">
                  <AudioLines className="h-[18px] w-[18px]" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-10 w-10 min-h-0 rounded-lg text-muted-foreground sm:h-9 sm:w-9"
                  onClick={() => { setIsOpen(false); navigate('/assistant-reports'); }}
                  title="گزارش‌های دستیار" aria-label="گزارش‌های دستیار"
                >
                  <BarChart3 className="h-[18px] w-[18px]" />
                </Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 min-h-0 rounded-lg text-muted-foreground sm:h-9 sm:w-9" onClick={() => setIsOpen(false)} title="بستن" aria-label="بستن">
                  <X className="h-[18px] w-[18px]" />
                </Button>
              </div>
            </header>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col justify-end gap-6 pb-2">
                  <div>
                    <p className="text-xl font-semibold">سلام{firstName ? ` ${firstName}` : ''}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      هر چیزی که در ذهن دارید بنویسید یا بگویید؛ ثبتش می‌کنم، یادم می‌ماند و وقتی لازم شد پیدایش می‌کنم.
                    </p>
                  </div>
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.text}
                        onClick={() => pickSuggestion(s)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted/60"
                      >
                        <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="leading-5">{s.hint || s.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-start' : 'justify-end')}>
                      {message.role === 'user' ? (
                        <div className="max-w-[85%] rounded-2xl rounded-ss-md bg-muted px-3.5 py-2.5 text-sm leading-6">
                          {message.attachment && (
                            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <FileIcon type={message.attachment.type} className="h-3.5 w-3.5" />
                              <span className="truncate">{message.attachment.fileName}</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      ) : (
                        <div className="w-full min-w-0 space-y-2.5">
                          {message.steps && message.steps.length > 0 && (
                            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" aria-label="کارهایی که دستیار انجام داد">
                              {message.steps.map((s, i) => (
                                <li key={i} className="flex items-center gap-1.5">
                                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
                                  {s.label}
                                </li>
                              ))}
                            </ol>
                          )}

                          {message.isLoading ? (
                            <ThinkingDots />
                          ) : (
                            <div className={cn('break-words text-sm leading-7', message.isError && 'flex items-start gap-2 text-destructive')}>
                              {message.isError && <AlertCircle className="mt-1.5 h-4 w-4 shrink-0" />}
                              {message.isError ? <p>{message.content}</p> : <AssistantMarkdown content={message.content} />}
                            </div>
                          )}

                          {message.actions && message.actions.length > 0 && (
                            <div className="space-y-2">
                              {message.actions.map((action) => (
                                <ActionRow
                                  key={action.id}
                                  action={action}
                                  disabled={isLoading}
                                  onConfirm={() => runAction(message.id, action)}
                                  onDismiss={() => updateAction(message.id, action.id, { state: 'dismissed' })}
                                />
                              ))}
                            </div>
                          )}

                          {message.id === lastAssistantId && message.questions?.some((q) => q.options?.length) && (
                            <div className="flex flex-wrap gap-2">
                              {message.questions.flatMap((q) => q.options || []).map((option) => (
                                <button
                                  key={option}
                                  onClick={() => sendMessage(option)}
                                  disabled={isLoading}
                                  className="min-h-[34px] rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted disabled:opacity-50 sm:min-h-0"
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-border p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {(attachedFile || interimTranscript) && (
                <div className="mb-2 space-y-1.5">
                  {attachedFile && (
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
                      <FileIcon type={attachedFile.type} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{attachedFile.fileName}</span>
                      <button onClick={clearAttachment} className="min-h-0 text-muted-foreground hover:text-foreground" aria-label="حذف فایل">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {interimTranscript && <p className="px-1 text-xs text-muted-foreground">{interimTranscript}…</p>}
                </div>
              )}

              <div className="rounded-xl border border-border bg-card transition-[border-color,box-shadow] focus-within:border-signal focus-within:shadow-[0_0_0_3px_hsl(var(--signal)/0.14)]">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? 'در حال شنیدن…' : 'بپرس یا چیزی ثبت کن…'}
                  className="block max-h-40 w-full resize-none bg-transparent px-3.5 pt-3 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none"
                />
                <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                  <Button
                    variant="ghost" size="icon"
                    className="h-9 w-9 min-h-0 rounded-lg text-muted-foreground sm:h-8 sm:w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFile}
                    title="پیوست فایل" aria-label="پیوست فایل"
                  >
                    {isProcessingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,audio/*,.pdf,.xlsx,.xls,.csv,.mp3,.wav,.m4a,.webm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  {voiceSupported && (
                    <Button
                      variant="ghost" size="icon"
                      className={cn('h-9 w-9 min-h-0 rounded-lg text-muted-foreground sm:h-8 sm:w-8', isListening && 'bg-destructive/10 text-destructive')}
                      onClick={() => (isListening ? stopListening() : startListening())}
                      title={isListening ? 'توقف' : 'گفتن به‌جای نوشتن'} aria-label="ورودی صوتی"
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  )}
                  {tts.isSupported && (
                    <Button
                      variant="ghost" size="icon"
                      className={cn('h-9 w-9 min-h-0 rounded-lg text-muted-foreground sm:h-8 sm:w-8', tts.isEnabled && 'text-foreground')}
                      onClick={() => { if (tts.isEnabled) tts.stop(); tts.toggleEnabled(); }}
                      title={tts.isEnabled ? 'پاسخ صوتی روشن است' : 'پاسخ صوتی خاموش است'}
                      aria-label="پاسخ صوتی" aria-pressed={tts.isEnabled}
                    >
                      {tts.isEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    onClick={() => sendMessage(input)}
                    disabled={(!input.trim() && !attachedFile) || isLoading}
                    className="ms-auto h-9 w-9 min-h-0 rounded-lg sm:h-8 sm:w-8"
                    aria-label="ارسال"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVoiceMode && <MoraVoiceAssistant onClose={() => setIsVoiceMode(false)} />}
      </AnimatePresence>
    </>
  );
}
