import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendSms } from '../utils/sms.js';
import { AiUnavailableError, chatCompletion, getApiKey } from '../agent/llm.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { SERVER_TOOLS, TOOLS, isWriteTool, planWriteAction, stepLabel } from '../agent/tools.js';
import { resolveTimeZone } from '../agent/time.js';

const router = Router();

// The agent may look things up and act several times before answering.
const MAX_STEPS = 6;
const TURN_DEADLINE_MS = 100_000;
const HISTORY_LIMIT = 16;
const TOOL_RESULT_LIMIT = 6000;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

function buildUserContent(message, attachment) {
  if (!attachment) return message;
  const content = String(attachment.content || '');
  return `[فایل ضمیمه: ${attachment.fileName || 'بدون نام'} (${attachment.type || 'نامشخص'})]
${content.slice(0, TOOL_RESULT_LIMIT) || 'محتوایی استخراج نشد'}${content.length > TOOL_RESULT_LIMIT ? '\n…(ادامه دارد)' : ''}

درخواست کاربر: ${message}`;
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

// Some open models leak their reasoning into the content.
const cleanText = (text) => String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

function fallbackMessage(actions, questions) {
  if (questions.length) return questions.map((q) => q.question).join('\n');
  const done = actions.filter((a) => a.status === 'pending');
  const waiting = actions.filter((a) => a.status === 'needs_confirmation');
  const parts = [];
  if (done.length) parts.push(`انجام شد:\n${done.map((a) => `- ${a.feedback.location}: ${a.feedback.details}`).join('\n')}`);
  if (waiting.length) parts.push(`منتظر تأیید شما:\n${waiting.map((a) => `- ${a.feedback.details}`).join('\n')}`);
  return parts.join('\n\n') || 'متوجه نشدم؛ می‌شه کمی بیشتر توضیح بدی؟';
}

// ─── SMS execution endpoint (called after user confirms) ─────────────────────
router.post('/execute-sms', requireAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone و message الزامی هستند' });
  try {
    await sendSms(phone, message);
    res.json({ success: true, to: phone });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { message, conversationHistory = [], context = {}, attachment = null } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'پیام معتبر نیست' });
  if (!getApiKey()) return res.status(500).json({ error: 'سرویس هوش مصنوعی پیکربندی نشده است' });

  const startedAt = Date.now();
  const ctx = {
    userId: req.user.id,
    tz: resolveTimeZone(context.timezone),
    now: new Date(),
    page: typeof context.page === 'string' ? context.page.slice(0, 200) : null,
  };

  const result = { message: '', actions: [], questions: [], steps: [], model: null };
  const seenActions = new Set();

  try {
    const messages = [
      { role: 'system', content: await buildSystemPrompt(ctx) },
      ...sanitizeHistory(conversationHistory),
      { role: 'user', content: buildUserContent(message, attachment) },
    ];

    let finalText = '';
    for (let step = 0; step < MAX_STEPS && Date.now() - startedAt < TURN_DEADLINE_MS; step++) {
      const { message: ai, model } = await chatCompletion({ messages, tools: TOOLS, preferred: result.model });
      result.model = model;

      const calls = (ai.tool_calls || []).map((c, i) => ({ ...c, id: c.id || `call_${step}_${i}`, type: 'function' }));
      if (!calls.length) {
        finalText = cleanText(ai.content);
        break;
      }

      messages.push({ role: 'assistant', content: ai.content || '', tool_calls: calls });
      let askedUser = false;

      for (const call of calls) {
        const name = call.function?.name;
        const args = parseArgs(call.function?.arguments);
        let output;

        if (name === 'ask_clarification') {
          result.questions.push({ question: String(args.question || ''), options: Array.isArray(args.options) ? args.options.slice(0, 6) : undefined, field: args.field });
          output = { ok: true, note: 'سوال به کاربر نشان داده شد' };
          askedUser = true;
        } else if (SERVER_TOOLS[name]) {
          output = await SERVER_TOOLS[name](args, ctx);
          result.steps.push({ tool: name, label: stepLabel(name, args) });
        } else if (isWriteTool(name)) {
          const planned = await planWriteAction(name, args, ctx);
          if (planned.action) {
            const key = `${name}:${JSON.stringify(planned.action.params)}`;
            if (!seenActions.has(key)) {
              seenActions.add(key);
              result.actions.push(planned.action);
            }
            output = {
              ok: true,
              status: planned.action.status === 'pending' ? 'queued_will_be_saved' : 'awaiting_user_confirmation',
              saved_in: planned.action.feedback.location,
              params: planned.action.params,
            };
          } else {
            output = planned;
          }
        } else {
          output = { error: 'UNKNOWN_TOOL' };
        }

        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output).slice(0, TOOL_RESULT_LIMIT) });
      }

      if (askedUser) {
        finalText = cleanText(ai.content);
        break;
      }
    }

    // Out of steps right after tool results: ask once more for a plain answer.
    if (!finalText && !result.questions.length && messages.at(-1).role === 'tool') {
      try {
        const { message: ai } = await chatCompletion({ messages, tools: TOOLS, toolChoice: 'none', preferred: result.model });
        finalText = cleanText(ai.content);
      } catch (err) {
        console.warn('[agent] final summary failed:', err.message);
      }
    }

    result.message = finalText || fallbackMessage(result.actions, result.questions);
    console.info(`[agent] user=${ctx.userId} model=${result.model} steps=${result.steps.length} actions=${result.actions.length} ${Date.now() - startedAt}ms`);
    res.json(result);
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      const busy = 'سرویس هوش مصنوعی الان در دسترس نیست. چند لحظه دیگر دوباره امتحان کنید.';
      return res.status(503).json({ ...result, message: busy, error: busy });
    }
    console.error('[agent] error:', error);
    const failed = 'متأسفانه مشکلی پیش آمد. لطفاً دوباره تلاش کنید.';
    res.status(500).json({ ...result, message: failed, error: failed });
  }
});

export default router;
