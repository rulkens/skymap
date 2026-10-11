/**
 * MissionsSettings — the sampled craft. `trails` is off by default; a timeline exhibit forces it
 * on and the takeover bracket restores it on exit.
 */

export type MissionsSettings = {
  trails: boolean;
  /** A `SAMPLED_BODIES` id whose mission trail and caption stay full strength while the other
   *  sampled craft dim; null = no emphasis. */
  readonly craft: string | null;
};
