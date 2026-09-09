/**
 * The one bounded orientation decay (R1): a driven write moves an orientation
 * residual toward its target by `clamp(share·residual, ±capRad)` — no
 * threshold or direction split exists to snap. `rideBoundRad` is the ride's
 * continuity guard: a reference/target move beyond it in ONE notch is treated
 * as unauthored — the ride takes the bounded part, the capped decay spends the
 * rest — so a degenerate blend flip cannot whip the image. One home: both arms'
 * settles read THIS record (ruling 8).
 */
export const ORIENT_DECAY = {
  share: 0.25,
  capRad: 0.1,
  rideBoundRad: 0.3,
} as const;
