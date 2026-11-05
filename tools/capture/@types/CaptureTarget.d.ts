import type { PaletteCardCapture } from '../../../src/@types/palette/PaletteCardCapture';
import type { ExhibitId } from '../../../src/@types/exhibits/ExhibitId';

/**
 * One shot `capture.ts` will take: its output file and how to frame it.
 * `cardId` names it in the log and `--force`; `outPath` is where it lands, so
 * the writer never needs to know whether it is a palette card or a structure.
 * `pose` is the kind with no subject to fly to — a tour card, whose beats carry
 * clips rather than a focus id, so the only thing to say is where to stand.
 */
export type CaptureTarget =
  | { cardId: string; kind: 'focus'; focusId: string; capture: PaletteCardCapture; outPath: string }
  | {
      cardId: string;
      kind: 'exhibit';
      exhibitId: ExhibitId;
      capture: PaletteCardCapture;
      outPath: string;
    }
  | { cardId: string; kind: 'pose'; capture: PaletteCardCapture; outPath: string };
