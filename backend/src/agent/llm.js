/**
 * OpenAI-compatible chat client (OpenRouter by default) with model fallback.
 *
 * Env:
 *   OPENROUTER_API_KEY (or LOVABLE_API_KEY)  – API key
 *   ASSISTANT_MODELS                         – optional comma-separated model list, tried in order
 *   ASSISTANT_API_BASE                       – optional base URL (default https://openrouter.ai/api/v1)
 */

const DEFAULT_MODELS = [
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'deepseek/deepseek-v3-0324:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

export const getApiKey = () => process.env.OPENROUTER_API_KEY || process.env.LOVABLE_API_KEY;

function getModels() {
  const custom = (process.env.ASSISTANT_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  return custom.length ? custom : DEFAULT_MODELS;
}

export class AiUnavailableError extends Error {}

/**
 * One chat completion. `preferred` is tried first so a multi-step turn stays on
 * the model that already succeeded. Returns { message, model }.
 */
export async function chatCompletion({ messages, tools, toolChoice = 'auto', preferred, temperature = 0.3, maxTokens = 1800, timeoutMs = 45000 }) {
  const base = (process.env.ASSISTANT_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const models = getModels();
  const order = preferred && models.includes(preferred) ? [preferred, ...models.filter((m) => m !== preferred)] : models;

  for (const model of order) {
    try {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aimora.app',
          'X-Title': 'Aimora Assistant',
        },
        body: JSON.stringify({
          model, messages, temperature, max_tokens: maxTokens,
          ...(tools?.length ? { tools, tool_choice: toolChoice } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status === 401) throw new AiUnavailableError('invalid API key');
      if (!r.ok) {
        console.warn(`[agent] ${model} → HTTP ${r.status}`);
        continue;
      }
      const data = await r.json();
      const message = data.choices?.[0]?.message;
      if (message) return { message, model };
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      console.warn(`[agent] ${model} failed:`, err.message);
    }
  }
  throw new AiUnavailableError('all models failed');
}
