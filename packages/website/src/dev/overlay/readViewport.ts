import type { Viewport } from './@types/Viewport';

/** The window's scroll and size now. */
export function readViewport(): Viewport {
  return { scrollX, scrollY, width: innerWidth, height: innerHeight };
}
