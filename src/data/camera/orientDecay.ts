/**
 * The one bounded orientation decay (R1): every driven write moves an
 * orientation residual toward its target by `clamp(share·residual, ±capRad)`
 * — the fraction eases, the cap bounds any single tick, and no threshold or
 * direction split exists to snap. `rideBoundRad` is the ride's continuity
 * guard (round 6): a reference/target move beyond it in ONE notch is treated
 * as unauthored — the ride takes the bounded part, the capped decay spends
 * the rest — so a degenerate blend flip can never whip the image. One home:
 * the engaged settles and the world-arm approach alignment both read THIS
 * record ("same lerp", ruling 8). Feel-open until Task 22.
 */
export const ORIENT_DECAY = {
  share: 0.25,
  capRad: 0.1,
  rideBoundRad: 0.3,
} as const;
