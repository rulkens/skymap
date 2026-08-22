/**
 * labelLeaderLine — the leader-line geometry for a lifted world-anchored label:
 * the short connector that runs from a dot (a galaxy / body) UP to the text
 * caption floating above it.
 *
 * ### Why a SCREEN-space lift, not a world +Y offset
 *
 * The obvious way to lift a label off its dot is a fixed world-space `+Y`
 * offset — anchor the caption at `dot + [0, k, 0]` and draw the connector to
 * `dot + [0, 0.75k, 0]`. It reads simply, but it is WRONG, because the label's
 * glyphs stack in SCREEN space (the billboard renderer lays them out screen-up
 * from the anchor). A world `+Y` offset only projects to screen-up when the
 * camera happens to hold world `+Y` upright. Off that pose it misbehaves two
 * ways, both user-reported:
 *   - "too short" — looking near-along world `+Y`, the offset foreshortens; the
 *     projected connector collapses and the caption lands on the dot.
 *   - "falls over the text" — with the camera rolled or viewing from below,
 *     world `+Y` projects to screen-DOWN or sideways, so the connector points
 *     one way while the glyphs stack the other, laying the line over the text.
 * Lifting in SCREEN space instead means the connector always points at the
 * caption — a consistent length straight up — at ANY camera orientation.
 *
 * ### Why un-project back to a world point (not just return a 2D line)
 *
 * The marker-line renderer consumes WORLD endpoints (`markerLineRenderer.ts`
 * projects both endpoints itself, then expands the segment to a screen quad).
 * So the screen-space lift has to be handed back as a world point: we project
 * the dot to screen, step `liftPx` straight up, then UN-project that lifted
 * screen point back to a world position at the dot's depth (same clip-w). The
 * returned `toWorld` therefore projects to exactly `liftPx` above `fromWorld`
 * on screen, while remaining a legal world endpoint the renderer can pack.
 *
 * ### Why the inverse runs in f64 (`mat4d`)
 *
 * The un-project inverts the caller's vp. The COSMO label matrix is benign,
 * but the NEAR0 foreground vp at deep zoom is brutally ill-conditioned (near
 * down at `MIN_NEAR_MPC` while caption anchors sit ~1e-6 Mpc out, far beyond
 * the `FAR_MIN_MPC` far floor): inverting it at f32 precision collapses the
 * depth structure — the two huge w-row coefficients round to the SAME f32
 * value — and the un-projected point lands at a garbage depth, distorting the
 * lerped leader-line geometry by tens of pixels. `mat4d.inverse` keeps every
 * inverse element at f64, which is why `vp` also accepts `Float64Array`: the
 * NEAR0 layer passes its rebased f64 matrix straight through, while the f32
 * COSMO callers widen exactly (f32 → f64 is lossless), behaviour-identical.
 *
 * The f64 inverse holds only for anchors INSIDE the frustum. An anchor far
 * BEYOND the far plane still un-projects to a jittering point (its `ndc_z`
 * rounds to 1.0 within f64 error, which the inverse's huge depth rows amplify),
 * so the caller must keep the anchor in range: `foregroundLabelsLayer` clamps
 * far-star anchors to just inside the far plane before the lift (see its
 * header). This function trusts an in-domain anchor rather than clamping itself
 * — the layer owns the slab, so it owns the domain guard.
 *
 * Pure geometry — no engine state, no clock. The forward-projection step
 * is `forwardProjectPoint`, shared with `label2DDirector`'s `projectLabels`
 * and `projectToScreenPx`.
 */

import { mat4d } from 'wgpu-matrix';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ForwardProjectedPoint } from '../../@types/camera/ForwardProjectedPoint';
import { forwardProjectPoint } from './forwardProjectPoint';

// Reused across calls — see `projectToScreenPx`'s identical scratch for why
// a leaf function without its own loop still keeps the primitive alloc-free.
const scratch: ForwardProjectedPoint = {
  clipX: 0,
  clipY: 0,
  clipZ: 0,
  clipW: 0,
  screenX: 0,
  screenY: 0,
  onScreen: false,
};

export function labelLeaderLine(input: {
  /** The dot (galaxy / body) position in the layer's world frame. Not mutated. */
  anchorWorldPos: Vec3;
  /**
   * The view-projection the layer draws through (column-major, length 16).
   * Pass the f64 matrix when one exists (the NEAR0 foreground path) — the
   * inverse below wants the full precision; f32 inputs widen losslessly.
   */
  vp: Float32Array | Float64Array;
  /** Backing-store viewport size in pixels, `[width, height]`. */
  viewportPx: Vec2;
  /** Screen-space vertical lift, in pixels, from the dot to the text baseline. */
  liftPx: number;
}): { fromWorld: Vec3; toWorld: Vec3; anchorClipW: number } | null {
  const { anchorWorldPos: p, vp: m, viewportPx, liftPx } = input;
  const wx = p[0];
  const wy = p[1];
  const wz = p[2];

  // Forward-project the dot.
  forwardProjectPoint(m, wx, wy, wz, viewportPx, scratch);
  const clipX = scratch.clipX;
  const clipY = scratch.clipY;
  const clipZ = scratch.clipZ;
  const clipW = scratch.clipW;

  // Behind (or on) the camera plane: the projection is undefined, so there is
  // no meaningful leader line to draw.
  if (clipW <= 0) return null;

  // Lift straight UP `liftPx` pixels in screen space. Screen +Y points DOWN,
  // so a lift subtracts from screenY; converting the same step into NDC-Y (up
  // positive) it ADDS `2·liftPx / viewportH`. Only Y changes — screen-x, hence
  // NDC-x, hence clip-x, is untouched, so the connector rises perfectly
  // vertical on screen.
  const viewportH = viewportPx[1];
  const ndcY = clipY / clipW;
  const ndcYLifted = ndcY + (2 * liftPx) / viewportH;

  // Target clip point at the SAME depth as the dot (same clip-z, clip-w): only
  // clip-y moves, to the lifted NDC-y re-homogenised by clip-w.
  const targetClipX = clipX;
  const targetClipY = ndcYLifted * clipW;
  const targetClipZ = clipZ;
  const targetClipW = clipW;

  // Un-project: world = inv(vp) · targetClip, then perspective-divide. The
  // inverse is allocated per call — there is no shared inverse seam to reuse,
  // and this runs for a handful of labels per frame, so the cost is immaterial.
  // mat4d (f64) — an f32 inverse collapses the ill-conditioned NEAR0 depth
  // rows; see the module header.
  const inv = mat4d.inverse(m);
  const ox =
    inv[0]! * targetClipX + inv[4]! * targetClipY + inv[8]! * targetClipZ + inv[12]! * targetClipW;
  const oy =
    inv[1]! * targetClipX + inv[5]! * targetClipY + inv[9]! * targetClipZ + inv[13]! * targetClipW;
  const oz =
    inv[2]! * targetClipX + inv[6]! * targetClipY + inv[10]! * targetClipZ + inv[14]! * targetClipW;
  const ow =
    inv[3]! * targetClipX + inv[7]! * targetClipY + inv[11]! * targetClipZ + inv[15]! * targetClipW;

  return {
    fromWorld: [wx, wy, wz],
    toWorld: [ox / ow, oy / ow, oz / ow],
    // The anchor's homogeneous depth, exposed because consumers sizing the
    // caption's on-screen text (the shader's worldEm → px projection divides
    // by this same clip-w) would otherwise re-run the projection row to
    // recover it.
    anchorClipW: clipW,
  };
}
