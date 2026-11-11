/**
 * True when the focused control acts on this key itself, so the studio's keys leave it: a text
 * input (TextNumberField, ObjectPicker) takes every key, a select its arrows and Home/End, and a
 * key some control already default-prevented (the app's Slider, the dock grabber) stays that
 * control's, and a focused button keeps Space (it clicks itself). Escape and ⌘Z on a slider or
 * select still reach the studio.
 */
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function controlOwnsKey(
  event: Pick<KeyboardEvent, 'target' | 'key' | 'defaultPrevented'>,
): boolean {
  if (event.defaultPrevented || event.target instanceof HTMLInputElement) return true;
  if (event.key === ' ' && event.target instanceof HTMLButtonElement) return true;
  return event.target instanceof HTMLSelectElement && NAVIGATION_KEYS.has(event.key);
}
