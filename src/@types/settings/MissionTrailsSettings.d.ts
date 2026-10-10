/**
 * MissionTrailsSettings — the sampled-craft (Voyager) trails. Off by default; the
 * Voyager exhibit forces it on and the takeover bracket restores it on exit.
 */

export type MissionTrailsSettings = {
  enabled: boolean;
  /** A `SAMPLED_BODIES` id whose mission trail and caption stay full strength while the other
   *  sampled craft dim; null = no emphasis. */
  readonly emphasis: string | null;
};
