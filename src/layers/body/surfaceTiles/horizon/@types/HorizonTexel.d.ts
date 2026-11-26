/** HorizonTexel — where one sector's byte sits inside a post's 2×2 RGBA8 block
 *  (`horizonTexelOf`): texel offset `(dx, dy)` and channel 0–3 = R, G, B, A. */
export type HorizonTexel = {
  readonly dx: 0 | 1;
  readonly dy: 0 | 1;
  readonly channel: 0 | 1 | 2 | 3;
};
