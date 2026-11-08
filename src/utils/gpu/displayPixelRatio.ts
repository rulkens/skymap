/**
 * displayPixelRatio — device px per CSS px the canvas is sized at: the browser's
 * `devicePixelRatio`, capped at 2 (a 3× phone would pay 9× the fill of 1× for a
 * difference stars and text don't show). The canvas backing store, the pick read
 * and the label sizes all scale by this one value, so they agree.
 */
export function displayPixelRatio(): number {
  // Through `window?`, and `|| 1`: node has no window, and jsdom can report 0.
  return Math.min(globalThis.window?.devicePixelRatio || 1, 2);
}
