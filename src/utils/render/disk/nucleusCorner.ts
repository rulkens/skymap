/**
 * nucleusCorner — pure placement-math mapping a famous-galaxy
 * thumbnail's nucleus into the disk's local corner frame.
 *
 * A shipped WebP frames its disk arbitrarily: the nucleus may sit
 * off-centre (`center != [0.5, 0.5]`). This helper translates the curated
 * calibration's nucleus position into the disk's render frame. It is
 * deliberately pure (no GPU, no state) so it can be unit-tested exactly
 * and reused from the textured-disk subsystem without dragging in
 * renderer plumbing.
 */

import type { Vec2 } from '../../../@types/math/Vec2';

/**
 * Nucleus position mapped from normalised WebP coordinates into the
 * disk's LOCAL corner frame ([-1, +1]²).
 *
 * The disk quad's corners run [-1, +1]² in the disk plane; the vertex
 * shader places each corner via the (major, minor) basis it derives on
 * the GPU.  The nucleus sits at the normalised `center` within the WebP
 * (y-down, [0.5, 0.5] = frame centre).  Mapping it into the same corner
 * frame lets the shader subtract it from every corner (`corner - nucleus`),
 * which slides the quad so the *nucleus* — not the frame centre — lands on
 * the catalog 3-D point.  Doing the subtraction in the shader's own basis
 * means there is no CPU-side world basis to reconstruct (and no chance of
 * it diverging from the GPU's).
 *
 *   corner = center * 2 - 1
 *
 * A centred nucleus (`[0.5, 0.5]`) maps to `[0, 0]` — the uncalibrated
 * default that leaves the quad unshifted.
 *
 * No v-flip is applied: the atlas uploads top-down (`flipY: false`) and
 * the shader remaps `corner.y = webp-v * 2 - 1` in the SAME direction, so
 * webp-top (v = 0) and corner.y = -1 already coincide.  Flipping here
 * would un-pair them.
 */
export function nucleusCorner(center: Vec2): Vec2 {
  return [center[0] * 2 - 1, center[1] * 2 - 1];
}
