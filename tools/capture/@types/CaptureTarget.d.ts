import type { PaletteCardCapture } from '../../../src/@types/palette/PaletteCardCapture';
import type { ViewId } from '../../../src/@types/views/ViewId';

/**
 * One card `capture.ts` will shoot: its output filename and how to frame it.
 * `pose` is the kind with no subject to fly to — a tour card, whose beats carry
 * clips rather than a focus id, so the only thing to say is where to stand.
 */
export type CaptureTarget =
  | { cardId: string; kind: 'focus'; focusId: string; capture: PaletteCardCapture }
  | { cardId: string; kind: 'view'; viewId: ViewId; capture: PaletteCardCapture }
  | { cardId: string; kind: 'pose'; capture: PaletteCardCapture };
