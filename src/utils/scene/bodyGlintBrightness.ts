/**
 * bodyGlintBrightness — the naked-eye brightness of a sub-pixel scene body,
 * before the descent cross-fade.
 *
 *   apparent size  x  albedo luminance  x  illuminated fraction (phase)
 *
 * A planet too small to resolve as a mesh is drawn as a single additive point
 * whose brightness is this product (the cross-fade `fadeBand` the layer applies
 * on top is a SEPARATE factor — see `bodyGlintsLayer`). Three physically honest
 * terms:
 *
 *   - **apparent size** — a bigger (closer) sub-pixel body glints brighter. The
 *     apparent diameter in px, normalised into `[0, 1)` by `BODY_GLINT_MAX_PX`
 *     (the same constant that bounds the glint regime), so the term and the
 *     partition boundary read the same pixel size.
 *   - **albedo luminance** — a Rec.709 luma of the linear-RGB albedo, so a
 *     high-albedo body (Venus) outshines a dark one (Neptune) at equal apparent
 *     size, which is why the naked-eye planets rank the way they do.
 *   - **illuminated fraction (phase)** — `(1 + cos α) / 2`, where α is the
 *     Sun–body–camera phase angle: `cos α = dot(toSun, toCam)` from the body.
 *     Full phase (camera on the sunlit side) → 1; new phase (the unlit far side)
 *     → 0, so a body whose lit face is turned away adds no light. The phase is a
 *     dot of two directions and thus frame-invariant — computing it in the world
 *     frame is identical to `dot(sunDirLocal, viewDirLocal)`, so the body's
 *     orientation cancels and is not needed here.
 *
 * Pure and orientation-free, so it unit-tests headlessly against hand-computed
 * expectations. Returns a value in `[0, 1)`.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { BODY_GLINT_MAX_PX } from '../../services/engine/frame/partitionBodiesByPresentation';

// Rec.709 luma weights — the luminance of a linear-RGB albedo tint.
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

export function bodyGlintBrightness(input: {
  albedo: Readonly<Vec3>;
  positionMpc: Readonly<Vec3>;
  camPosMpc: Readonly<Vec3>;
  renderOriginMpc: Readonly<Vec3>;
  apparentDiameterPx: number;
}): number {
  const { albedo, positionMpc, camPosMpc, renderOriginMpc, apparentDiameterPx } = input;

  // Apparent-size factor in [0, 1): normalise by the glint-regime ceiling.
  const sizeFactor = Math.min(Math.max(apparentDiameterPx, 0) / BODY_GLINT_MAX_PX, 1);

  // Albedo luminance (Rec.709).
  const lum = LUMA_R * albedo[0] + LUMA_G * albedo[1] + LUMA_B * albedo[2];

  // Illuminated fraction from the Sun–body–camera geometry (frame-invariant).
  const sx = renderOriginMpc[0] - positionMpc[0];
  const sy = renderOriginMpc[1] - positionMpc[1];
  const sz = renderOriginMpc[2] - positionMpc[2];
  const sLen = Math.hypot(sx, sy, sz);
  const cx = camPosMpc[0] - positionMpc[0];
  const cy = camPosMpc[1] - positionMpc[1];
  const cz = camPosMpc[2] - positionMpc[2];
  const cLen = Math.hypot(cx, cy, cz);
  // Degenerate (body at the Sun, or camera on the body) — no meaningful phase;
  // treat as fully lit. The camera-on-body case never reaches here anyway (the
  // partition sends distance-0 bodies to the mesh, not the glint).
  const illum =
    sLen > 0 && cLen > 0
      ? Math.max(0, 1 + (sx * cx + sy * cy + sz * cz) / (sLen * cLen)) * 0.5
      : 1;

  return sizeFactor * lum * illum;
}
