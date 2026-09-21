import type { PaletteCardCapture } from '../../../src/@types/palette/PaletteCardCapture';
import type { ViewId } from '../../../src/@types/views/ViewId';

/** One card `capture.ts` will shoot: its output filename and how to frame it. */
export type CaptureTarget =
  | { cardId: string; kind: 'focus'; focusId: string; capture: PaletteCardCapture }
  | { cardId: string; kind: 'view'; viewId: ViewId; capture: PaletteCardCapture };
