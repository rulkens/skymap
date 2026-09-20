import type { PaletteCardCapture } from '../../src/@types/palette/PaletteCardCapture';

/** One card `captureFeatured.ts` will shoot: its output filename and how to frame it. */
export type CaptureTarget = { cardId: string; focusId: string; capture: PaletteCardCapture };
