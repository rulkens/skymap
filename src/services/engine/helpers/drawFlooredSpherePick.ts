/**
 * drawFlooredSpherePick — stamp ONE foreground body sphere into the r32uint pick
 * pass with its pick radius floored to the shared clickable minimum.
 *
 * ### Why a helper
 *
 * Four NEAR0 sphere-body layers — `earthLayer`, `planetsLayer`,
 * `starSpheresLayer`, `fieldStarSphereLayer` — each ended their `drawPick`
 * with the SAME recipe: measure the camera-to-body distance, floor the pick
 * radius to `minPickRadiusMpc` (so a far-edge sphere that projects to a couple of
 * pixels still has a clickable footprint), compose the body MVP in f64 from the
 * slab's view-projection (the `composeBodyMvp` seam), and hand it to
 * `bodyPickRenderer.drawSphere`. That cam-distance → floored-MVP → drawSphere
 * sequence is a single shared mechanism; copied four ways, a change to it (a
 * different floor input, a new compose argument) would have to be made in four
 * places. Folding it here makes it one.
 *
 * ### What stays at the call site
 *
 * The body IDENTITY does not: each caller composes its own `packedId`
 * (`packSelection(source, seedIndex + PICK_SENTINEL_OFFSET)`) from its own source
 * code and stable seed index, and passes the finished value in. Identity stays
 * layer-owned; only the geometry/floor/draw is shared. `orientation` and
 * `oblateness` are parameters too — Earth and the planets carry a baked
 * orientation, the stars pass `IDENTITY_MAT3` (a resolved star sphere is
 * rotation-invariant) and the scene stars additionally an `oblateness`.
 *
 * The pick radius is FLOORED but the VISUAL sphere each layer's `draw` composes
 * is untouched — only this pick-pass model radius grows, so the hit area widens
 * without changing what the user sees.
 *
 * ### Why the floor needs no special case
 *
 * The floor is a CPU-side **model radius** inflation applied BEFORE
 * `composeBodyMvp` bakes the radius into the model scale — not a mesh trick. So
 * in the local frame the floored sphere simply IS the unit sphere, exactly as the
 * true-radius sphere is on the visual path: nothing downstream can tell the two
 * apart, which is why the mesh never knew about the floor and an analytic
 * silhouette test need not either.
 *
 * What that costs is one invariant: `camPosLocal` is a POSITION measured in the
 * frame the mvp's model scale defines, so both must come from the SAME radius.
 * Composing them here from the one `pickRadiusMpc` local is what makes that
 * automatic — a `camPosLocal` divided by the true `radiusMpc` while the mvp used
 * the floored one would place the ray origin too far out, shrinking the apparent
 * pick disc back below the floor for exactly the distant bodies the floor exists
 * to keep clickable.
 *
 * ### A second invariant this glosses over: the render origin
 *
 * `camPosMpc` and `positionMpc` are both absolute (heliocentric) Mpc, so
 * feeding them straight into `Math.hypot` above and into `camPosLocal` below
 * treats them as already sharing one frame. That is only true because
 * `RENDER_ORIGIN_MPC` (`src/data/renderOrigin.ts`) is `[0, 0, 0]` today —
 * `composeBodyMvp` separately subtracts it when building the mvp. A dynamic
 * render origin would move the mvp's frame without moving these two
 * positions, so both would need reducing to that same origin before either
 * use below. Left alone deliberately: nothing dynamic exists yet to reduce
 * against.
 */

import type { BodyPickRenderer } from '../../../@types/rendering/BodyPickRenderer';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { Vec3 } from '../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { camPosLocal } from '../../../utils/camera/camPosLocal';
import { composeBodyMvp } from '../../../utils/camera/composeBodyMvp';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { minPickRadiusMpc } from './minPickRadiusMpc';

export function drawFlooredSpherePick(
  pickRenderer: BodyPickRenderer,
  pass: GPURenderPassEncoder,
  args: {
    /** The slab's f64 view-projection (`view.slab.vp` — the f64 seam). */
    readonly vp: Float64Array;
    /** Absolute body position in world Mpc (heliocentric). */
    readonly positionMpc: Readonly<Vec3>;
    /** The body's TRUE equatorial radius in Mpc (what the visual sphere uses). */
    readonly radiusMpc: number;
    /** Camera position in the same origin-relative frame as `vp` (`view.camPos`). */
    readonly camPosMpc: Readonly<Vec3>;
    /** Pinhole radian→pixel conversion (`ctx.drawPxPerRad`), for the pick floor. */
    readonly drawPxPerRad: number;
    /** Baked local→world rotation, or `IDENTITY_MAT3` for a rotation-invariant body. */
    readonly orientation: Readonly<Mat3>;
    /** Polar flattening `(a−c)/a`; defaults to 0 (a true sphere). */
    readonly oblateness?: number;
    /** Fully-packed pick id (`packSelection(source, seedIndex + PICK_SENTINEL_OFFSET)`). */
    readonly packedId: number;
  },
): void {
  const dx = args.positionMpc[0] - args.camPosMpc[0];
  const dy = args.positionMpc[1] - args.camPosMpc[1];
  const dz = args.positionMpc[2] - args.camPosMpc[2];
  const pickRadiusMpc = minPickRadiusMpc(args.radiusMpc, Math.hypot(dx, dy, dz), args.drawPxPerRad);
  const mvp = composeBodyMvp(
    args.vp,
    args.positionMpc,
    RENDER_ORIGIN_MPC,
    pickRadiusMpc,
    args.orientation,
    args.oblateness,
  );
  // Same `pickRadiusMpc` and same `orientation`/`oblateness` the mvp was composed
  // with, so the mvp's model frame and this position share one definition of "the
  // frame where this body is the unit sphere".
  const camLocal = camPosLocal(
    args.camPosMpc,
    args.positionMpc,
    pickRadiusMpc,
    args.orientation,
    args.oblateness,
  );
  // Narrow here, at the r32uint pick pass's GPU upload — composeBodyMvp
  // returns f64 (see its header); this is a pure GPU-drawing consumer.
  pickRenderer.drawSphere(pass, {
    mvp: narrowMat4(mvp),
    camPosLocal: camLocal,
    packedId: args.packedId,
  });
}
