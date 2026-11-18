import type { LabelEnvelopePolicy } from './LabelEnvelopePolicy';

/** One label director (`LABEL_DIRECTORS`): the slab whose sources it draws and how it fades them. */
export type LabelDirectorRow = {
  readonly slab: number;
  readonly envelope: LabelEnvelopePolicy;
  /** A label nearer than this view depth, Mpc, has zero alpha (COSMO's near plane, which the label no longer shares with the draw). */
  readonly nearHideMpc?: number;
};
