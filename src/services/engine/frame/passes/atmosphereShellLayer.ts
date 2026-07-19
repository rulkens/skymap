/**
 * atmosphereShellLayer — Earth's physically-based in-scatter atmosphere as the
 * LAST content-layer row, drawn into the depth-bearing `foreground:0` target
 * (spec §8.3). A translucent proxy sphere scaled to the atmosphere-TOP radius,
 * sitting just outside the cloud shell.
 *
 * ### What it draws — the blue limb + reddened terminator
 *
 * For the seeded `bodies.earth` (the only atmosphere body today), this layer
 * draws the atmosphere-top proxy sphere through the shared `atmosphereShellRenderer`.
 * The renderer's shell pipeline culls FRONT faces, so only the proxy sphere's FAR
 * wall rasterises; depth-testing that far wall against the already-stamped opaque
 * planet separates the three regions for free — limb (space behind → passes),
 * over-disc (planet behind → occluded), nearer body in front (occluded) — with no
 * branch. The fragment samples this frame's sky-view LUT (baked by the
 * `atmosphereSkyView` compute step, in the compute prelude) to compose the
 * in-scattered radiance: a blue limb over the day side, a reddened arc along the
 * terminator/sunset.
 *
 * ### Why it draws LAST, OVER not opaque (spec §8.3)
 *
 * The atmosphere is the outermost translucent member of the `(foreground:0, NEAR0)`
 * group. It is registered LAST in `CONTENT_LAYERS` — after the opaque bodies, the
 * rings, AND Earth's cloud shell (which are NON-adjacent to it: the opaque spheres
 * and rings sit between the cloud shell and this shell) — so it draws once every
 * opaque sphere has stamped its depth. Its pipeline depth-TESTS against them
 * (`depthCompare: 'less-equal'`) but writes NO depth and blends straight-alpha
 * OVER, so this row carries `blend: 'over'` where the opaque bodies carry
 * `'opaque'`. It is non-pickable (a translucent halo has no clickable silhouette;
 * clicking Earth hits the opaque surface `earthLayer` stamps into the pick pass),
 * so it declares no `drawPick`.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` and every sphere-body layer: Earth sits ~1 AU from the
 * render origin, a tiny Mpc number the VP's large translation nearly cancels.
 * `composeBodyMvp` resolves that cancellation in double precision before narrowing
 * to f32; feeding it the already-narrowed `view.vp` would misplace the shell by
 * more than its own thickness. See `composeBodyMvp`'s module header.
 *
 * ### When it draws
 *
 * `enabled` gates on the `atmosphereShellRenderer` handle (null pre-bootstrap), the
 * shared near-field distance gate (`FOREGROUND_MAX_DISTANCE_MPC`), the seeded
 * `bodies.earth` record, that body having an `ATMOSPHERE_PARAMS` row (Moon / gas
 * giants have none — the same data-gate the ring table uses), and the shared
 * sub-pixel cull. Both `enabled` and `draw` read ONE `atmosphereShellDraw`
 * derivation, so the gate and the loop can never disagree. The per-frame sky-view
 * bake (`encodeAtmosphereSkyView`) gates on a strict SUPERSET of this predicate,
 * so a frame never draws the shell without having baked this frame's LUT.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { EngineState } from '../../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../@types/engine/frame/ReadyFrameContext';
import type { EarthBody } from '../../../../@types/scene/EarthBody';
import type { AtmosphereParams } from '../../../../@types/scene/AtmosphereParams';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../../../data/bodies/atmosphereParams';
import { ATMOSPHERE_SHELL_PARAMS } from '../../../../data/bodies/atmosphereShellParams';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { packAtmosphereUniforms } from '../../../../utils/gpu/packAtmosphereUniforms';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';

/**
 * The Earth record + its atmosphere params to draw the shell for this frame, or
 * `null` if the shell should not render — the body is unseeded, has no atmosphere
 * row, or resolves to sub-pixel. ONE derivation feeds both `enabled` and `draw`,
 * so the gate and the loop can never disagree. Mirrors `cloudShellLayer`'s
 * near-field derivation.
 */
function atmosphereShellDraw(
  state: EngineState,
  ctx: ReadyFrameContext,
): { earth: EarthBody; params: AtmosphereParams } | null {
  const earth = state.data.bodies.earth;
  if (earth === null) return null;
  const params = ATMOSPHERE_PARAMS[earth.id];
  if (params === undefined) return null;
  // Sub-pixel cull on Earth's SURFACE diameter — the shared body gate, matching
  // the surface / cloud-shell rows so the limb appears exactly when the disc
  // does. (The alternative — culling on the atmosphere-TOP diameter — would keep
  // the limb visible a hair longer as the disc shrinks; a tunable, deliberately
  // NOT taken here for consistency with the opaque body it haloes.) A zero
  // camera-to-centre distance means the camera is INSIDE the body —
  // apparentSizePx defensively returns 0 there, which would read as sub-pixel, so
  // treat it as resolved.
  const dx = earth.positionMpc[0] - ctx.drawCamPos[0];
  const dy = earth.positionMpc[1] - ctx.drawCamPos[1];
  const dz = earth.positionMpc[2] - ctx.drawCamPos[2];
  const distanceMpc = Math.hypot(dx, dy, dz);
  if (distanceMpc === 0) return { earth, params };
  const diameterPx = apparentSizePx({
    diameterKpc: (2 * earth.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
    distanceMpc,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
  });
  return diameterPx >= SUB_PIXEL_BODY_CULL_PX ? { earth, params } : null;
}

export const atmosphereShellLayer: ContentLayer = {
  name: 'atmosphere-shell',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx) {
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch ctx or the body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    // A row that would draw nothing (unseeded / no atmosphere row / sub-pixel)
    // must leave the pass plan: mirror draw's branch with the SAME derivation.
    return atmosphereShellDraw(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null) return;
    const drawn = atmosphereShellDraw(state, ctx);
    if (drawn === null) return;
    const { earth, params } = drawn;

    // Scale the unit proxy sphere to the ATMOSPHERE-TOP radius (the shell's outer
    // extent) from the slab's f64 vp (the f64 seam), folding in Earth's baked
    // orientation so the sky-view frame co-registers with the surface.
    const atmosphereTopMpc = params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC;
    const mvp = composeBodyMvp(
      view.slab.vp,
      earth.positionMpc,
      RENDER_ORIGIN_MPC,
      atmosphereTopMpc,
      earth.orientation,
    );
    // Sun rotated into Earth's local frame (its baked orientation carries the
    // axial tilt), co-framed with the in-scatter integral's sun direction.
    const sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation);
    // The camera in atmosphere-top-radius units — the view vector the in-scatter
    // fragment marches along. `view.camPos` is a copy of `ctx.drawCamPos` (the
    // rendered pose), the SAME vector `encodeAtmosphereSkyView` bakes the sky-view
    // LUT from. Scaling by the atmosphere-top radius (NOT the surface radius) is
    // what that SAME-radius LUT bake expects, so the baked view height and the
    // fragment altitude agree (the bake packs |camPosLocal| × atmosphereTopKm from
    // the same pose).
    const camLocal = camPosLocal(
      view.camPos,
      earth.positionMpc,
      atmosphereTopMpc,
      earth.orientation,
    );
    // Ground/atmosphere-top radius ratio ∈ (0,1): in the proxy's local frame the
    // atmosphere top is the unit sphere and the ground sphere has this radius.
    const bottomRadius = params.planetRadiusKm / params.atmosphereTopKm;
    // Exposure is the live Settings → Display → Earth knob (seeded from
    // `ATMOSPHERE_SHELL_PARAMS.exposure`); `EngineState.settings` is a live store
    // getter, so this reads the current value every frame. sunIrradiance stays a
    // static data-file constant (fragment-unused today).
    renderer.draw(
      pass,
      packAtmosphereUniforms(
        mvp,
        sun,
        camLocal,
        bottomRadius,
        ATMOSPHERE_SHELL_PARAMS.sunIrradiance,
        state.settings.earth.atmosphereExposure,
      ),
    );
  },
};
