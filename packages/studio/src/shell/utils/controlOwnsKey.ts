/** True when the focused control acts on this key itself: a text input takes every key, a select
 * its arrows and Home/End, a button Space, and a key a control default-prevented stays its own.
 * Escape and ⌘Z on a slider or select still reach the studio. */
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function controlOwnsKey(
  event: Pick<KeyboardEvent, 'target' | 'key' | 'defaultPrevented'>,
): boolean {
  if (event.defaultPrevented || event.target instanceof HTMLInputElement) return true;
  if (event.key === ' ' && event.target instanceof HTMLButtonElement) return true;
  return event.target instanceof HTMLSelectElement && NAVIGATION_KEYS.has(event.key);
}
