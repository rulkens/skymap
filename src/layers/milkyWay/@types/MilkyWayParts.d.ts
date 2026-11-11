/**
 * MilkyWayParts — what the Milky Way draws this frame, derived from
 * `renderer` by `selectMilkyWayParts`. `cloudDust` is split from `cloud`
 * because `'both'` sums the cloud's stars with the field, whose own dust
 * replaces the cloud's.
 */
export type MilkyWayParts = {
  readonly cloud: boolean;
  readonly cloudDust: boolean;
  readonly field: boolean;
};
