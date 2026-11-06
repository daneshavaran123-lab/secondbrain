// Links in the assistant's answers (specs/002-assistant-links-notifications/contracts/assistant-references.md).
// The server gives each record it names a key (r1, r2…) and its page; only those keys become links.

export interface AssistantReference {
  key: string;
  type: string;
  id: string;
  title: string;
  path: string;
  /** Persian name of the record's type, for screen readers */
  label?: string;
}

/** An in-app page: starts with one «/», no scheme, no spaces. */
export const isAppPath = (p: unknown): p is string =>
  typeof p === 'string' && /^\/(?!\/)/.test(p) && !p.includes(':') && !/\s/.test(p);

/** The reference a markdown link points at, or null when the link must stay plain text. */
export function referenceFor(href: string | undefined, references: AssistantReference[] | undefined) {
  const key = /^ref:(r\d+)$/.exec(href ?? '')?.[1];
  const ref = key ? references?.find((r) => r.key === key) : undefined;
  return ref && isAppPath(ref.path) ? ref : null;
}

/** Keep ref: links through the markdown renderer; everything else it drops or makes safe. */
export const keepRefUrls = (url: string) => (/^ref:r\d+$/.test(url) ? url : '');

/** Where «باز کردن» on a done action goes: its page, with the new record highlighted when the page can. */
export function actionPage(feedback: { page?: string; highlight?: boolean } | undefined, createdId?: string | null) {
  if (!feedback?.page || !isAppPath(feedback.page)) return null;
  if (!feedback.highlight || !createdId) return feedback.page;
  return `${feedback.page}${feedback.page.includes('?') ? '&' : '?'}highlight=${encodeURIComponent(createdId)}`;
}
