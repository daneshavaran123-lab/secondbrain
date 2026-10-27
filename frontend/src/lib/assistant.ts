/**
 * Open the Mora assistant from anywhere in the app.
 * SmartAssistant listens for this event; with text it sends (or prefills) a message.
 */
export const ASSISTANT_ASK_EVENT = 'mora:ask';

export interface AssistantAskDetail {
  text?: string;
  send?: boolean;
}

export function askAssistant(text = '', send = true) {
  window.dispatchEvent(
    new CustomEvent<AssistantAskDetail>(ASSISTANT_ASK_EVENT, { detail: { text, send: send && !!text.trim() } })
  );
}
