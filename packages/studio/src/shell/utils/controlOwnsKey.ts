/**
 * True when the focused control acts on this key itself, so the studio's keys leave it: text entry
 * takes every key, a select or native range its arrows and Home/End, and a key some control already
 * default-prevented (the app's Slider, the dock grabber) stays that control's. Escape and ⌘Z on a
 * slider or select still reach the studio. The non-text input types are hotkeys-js's own list.
 */
const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'file',
  'reset',
  'submit',
  'color',
]);
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function controlOwnsKey(
  event: Pick<KeyboardEvent, 'target' | 'key' | 'defaultPrevented'>,
): boolean {
  const { target } = event;
  if (event.defaultPrevented) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)) return true;
  const picksWithArrows =
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && target.type === 'range');
  return picksWithArrows && NAVIGATION_KEYS.has(event.key);
}
