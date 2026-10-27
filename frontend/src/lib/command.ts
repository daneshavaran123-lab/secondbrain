/** Opens the command palette (search, create, ask the assistant) from anywhere. */
export const COMMAND_OPEN_EVENT = 'second-brain:command';

export function openCommandPalette() {
  window.dispatchEvent(new Event(COMMAND_OPEN_EVENT));
}

/** «⌘K» on Apple keyboards, «Ctrl K» elsewhere. */
export function commandShortcutLabel() {
  const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return apple ? '⌘K' : 'Ctrl K';
}
