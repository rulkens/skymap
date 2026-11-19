/** One label director (`LABEL_DIRECTORS`): the slab whose sources it draws. */
export type LabelDirectorRow = {
  readonly slab: number;
  /** A label nearer than this view depth, Mpc, has zero alpha (COSMO's near plane, which the label no longer shares with the draw). */
  readonly nearHideMpc?: number;
};
