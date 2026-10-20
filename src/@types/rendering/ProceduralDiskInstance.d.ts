import type { SourceType } from '../data/SourceType';

/**
 * ProceduralDiskInstance — one entry in the procedural-disk pass's per-instance
 * vertex buffer: a 3D-oriented quad per galaxy, no atlas UV rect.
 *
 *   - `sizeWorldMpc` is the FULL quad extent, `(diameterKpc/1000) * 4`, the same
 *     value the textured `DiskInstance.sizeWorld` carries; shaders halve it.
 *   - `axisRatio` is b/a in (0.05, 1]; `positionAngleDeg` is east-of-north, [0, 180).
 *   - `colourIndex` is normalised 0..2, the scalar behind the points colour ramp.
 *   - `crossfadeAlpha` fades in 0 below 8 px to 1 above 14 px (smoothstep).
 *   - `procFadeOut` fades the disk out in lockstep with a famous WebP fading in;
 *     1.0 otherwise (SDSS / DSS thumbnails rely on the procedural pattern
 *     filling the ellipse).
 *
 * Layout: 12 floats = 48 bytes, three `float32x4` slots; `@location` attributes
 * step in vec4 quanta, so the nine semantic floats cost three padding floats.
 */
export type ProceduralDiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorldMpc: number;
  axisRatio: number;
  positionAngleDeg: number;
  colourIndex: number;
  crossfadeAlpha: number;
  procFadeOut: number;
  /** Source + row identity, CPU-only: not in the nine-float vertex layout. */
  sourceCode: SourceType;
  /** The record's pick index (`pickOfOrdinal`) — the localIdx half of the packed pick id. */
  localIdx: number;
  /**
   * Effective amplitude `min(rawSbAmp, sbMax) * sbScale * sbBoost * brightness`,
   * pre-scaled per frame so slider moves need no uniform change. Packed into
   * `extras.w` (float slot 11), a padding float.
   */
  sbAmp: number;
};
