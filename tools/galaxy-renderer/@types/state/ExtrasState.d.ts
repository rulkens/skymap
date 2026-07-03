/**
 * ExtrasState — the "extra galaxies" background-scatter toggle: a handful of
 * small satellite galaxies rendered around the primary for visual context.
 * `regenNonce` is bumped to force a re-scatter with a fresh layout without
 * touching `count` or `enabled` — an explicit "reroll" action, mirroring the
 * seed-reroll pattern the generator's own seeds use.
 */

export type ExtrasState = {
  readonly enabled: boolean;
  readonly count: number;
  readonly regenNonce: number;
};
