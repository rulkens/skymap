import type { Label2DEnvelopePolicy } from '../engine/subsystems/Label2DEnvelopePolicy';

/** One label director (`LABEL_DIRECTORS`): the slab whose sources it draws and how it fades them. */
export type LabelDirectorRow = {
  readonly slab: number;
  /** Px of gap two kept labels' ink rects must clear (times pxScale). */
  readonly declutterPadPx: number;
  readonly envelope: Label2DEnvelopePolicy;
};
