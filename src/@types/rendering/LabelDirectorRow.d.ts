import type { LabelEnvelopePolicy } from './LabelEnvelopePolicy';

/** One label director (`LABEL_DIRECTORS`): the slab whose sources it draws and how it fades them. */
export type LabelDirectorRow = {
  readonly slab: number;
  /** Px of gap two kept labels' ink rects must clear (times pxScale). */
  readonly declutterPadPx: number;
  readonly envelope: LabelEnvelopePolicy;
  /** A label nearer than this view depth, Mpc, has zero alpha (COSMO's old near plane). */
  readonly nearHideMpc?: number;
};
