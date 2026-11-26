/**
 * StreakTaps — one anamorphic streak iteration's uniform, packed as
 * `[texel, stride, threshold, falloff, tint, 0, 0, 0]` (32 bytes).
 * `texel` is 1 / source width (uv per texel); `stride` and `falloff` are in
 * source texels; `threshold` 0 skips the soft threshold (iterations 1 and 2);
 * `tint` 0..1 shortens the red and green tails toward blue.
 */
export type StreakTaps = {
  readonly texel: number;
  readonly stride: number;
  readonly threshold: number;
  readonly falloff: number;
  readonly tint: number;
};
