/** One label director (`LABEL_DIRECTORS`): the slab whose sources it draws. */
export type LabelDirectorRow = {
  readonly slab: number;
  /** A label nearer the eye than this distance, Mpc, has zero alpha (COSMO's near plane, which the label no longer shares with the draw; distance, so a fisheye obeys it too). */
  readonly nearHideMpc?: number;
};
