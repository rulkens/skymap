/**
 * encodeAtmosphereSkyView — the per-frame sky-view LUT bake for the atmosphere
 * shell, a compute step recorded into the frame's single command encoder BEFORE
 * the foreground render pass opens.
 *
 * ### Why this runs in the compute prelude
 *
 * The atmosphere shell's fragment SAMPLES the sky-view LUT, which folds in this
 * frame's camera altitude + sun direction and so must be re-baked every frame
 * (the transmittance + multi-scatter LUTs are view-independent and baked once at
 * construction). If the draw ran before this bake the shell would sample a stale
 * or uninitialised table. Placing this `{ kind:'compute', name:'atmosphereSkyView' }`
 * step in the compute prelude (alongside `flow`) — well ahead of the
 * `foreground:0` render step — is what enforces the ordering: WebGPU inserts the
 * storage barrier between the compute write and the later fragment read within
 * the one encoder. Same shape as `encodeFlowCompute`.
 *
 * ### The gate is the layer's `enabled`, minus the sub-pixel cull
 *
 * This runs inside the ready-context gate, so it always has a `ReadyFrameContext`.
 * It applies every part of the layer's gate EXCEPT the sub-pixel disc cull: the
 * renderer handle, the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC` — the SAME `ctx.cam.distance` test the layer
 * uses), the seeded Earth body, and the body's `ATMOSPHERE_PARAMS` row. That is a
 * strict SUPERSET of the layer's gate: whenever `atmosphereShellLayer.enabled` is
 * true (which additionally requires the disc above sub-pixel), this bake has
 * already run — so the shell can never draw against a LUT this frame skipped
 * baking. The distance gate matters: without it the 192×108×30-step march would
 * run every frame post-bootstrap (Earth is seeded unconditionally), burning a full
 * sky-view bake even at galaxy / cosmic zoom where the shell is culled. Beyond the
 * near-field edge this is a no-op; the only residual over-bake is the thin band
 * where the camera is in near-field range but the disc has gone sub-pixel — a
 * harmless wasted compute (the layer's gate keeps the shell from drawing there).
 *
 * ### The sky-view uniform packing (the `SkyViewParams` contract)
 *
 * The renderer's `encodeSkyView` writes the passed 16-byte record VERBATIM into
 * its `SkyViewParams` buffer, so its layout is fixed by `AtmosphereShellRenderer`'s
 * `.d.ts` and mis-packing silently mis-indexes the LUT (the GPU would not report
 * it; on iOS it would drop the frame). Two live fields:
 *
 *   - `viewHeightKm` = |camPosLocal| × atmosphereTopKm. `camPosLocal` is the
 *     camera in atmosphere-top-radius units, built from the SAME rendered pose
 *     (`ctx.drawCamPos`) the shell fragment marches along and with the SAME
 *     atmosphere-top scale, so scaling its length by `atmosphereTopKm` recovers
 *     the camera radius in km — and the km-baked LUT and the local-unit fragment
 *     then agree, as the ratio-based LUT parametrisation requires.
 *   - `sunZenithCos` = dot(normalize(camPosLocal), sunDirLocal) — the cosine of
 *     the sun's zenith angle at the camera, `localUp` being the camera's radial
 *     direction in the body frame.
 *
 * The trailing two floats are pad (zeroed) rounding the struct to 16 bytes.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Vec3 } from '../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { camPosLocal } from '../../../utils/camera/camPosLocal';
import { sunDirLocal } from '../../../utils/camera/sunDirLocal';
import { FOREGROUND_MAX_DISTANCE_MPC } from './foregroundMaxDistance';

/**
 * Bake this frame's sky-view LUT into the atmosphere renderer's own texture,
 * reading the gate off `state` (the renderer handle, the seeded Earth, its
 * `ATMOSPHERE_PARAMS` row) and the camera altitude off `ctx.drawCamPos`. The gate
 * inputs must all hold — otherwise this is a no-op, the common Earth-out-of-view
 * path.
 */
export function encodeAtmosphereSkyView(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
): void {
  const renderer = state.gpu.atmosphereShellRenderer;
  if (renderer === null) return;
  // Near-field distance gate — the SAME cull `atmosphereShellLayer.enabled`
  // applies (handle first, then distance). Beyond this edge the shell is culled,
  // so baking its per-frame LUT would be pure overhead at galaxy / cosmic zoom.
  if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return;
  const earth = state.data.bodies.earth;
  if (earth === null) return;
  const params = ATMOSPHERE_PARAMS[earth.id];
  if (params === undefined) return;

  // Bake from the RENDERED pose (`ctx.drawCamPos`), NOT `state.cam.position`. The
  // latter is the drag register, re-seeded only on pointer-down and so stale
  // between gestures (scroll-zoom, tweens, tours) — baking the LUT for that
  // altitude while the shell fragment samples it at the live one violates the
  // AtmosphereShellRenderer sky-view MUST-equal contract. `ctx.drawCamPos` is the
  // exact vector the fragment marches along (via `view.camPos`), so the two agree.
  const camPosMpc: Vec3 = [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]];
  // The camera in atmosphere-top-radius units — the SAME rendered pose the shell
  // fragment receives (same util, same atmosphere-top scale), so the LUT's baked
  // view height and the fragment's local altitude cannot disagree.
  const camLocal = camPosLocal(
    camPosMpc,
    earth.positionMpc,
    params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC,
    earth.orientation,
  );
  const sun = sunDirLocal(earth.positionMpc, RENDER_ORIGIN_MPC, earth.orientation);

  const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
  // |camPosLocal| × atmosphereTopKm recovers the camera radius in km (camLocal is
  // in atmosphere-top-radius units), matching the km-baked LUT parametrisation.
  const viewHeightKm = radius * params.atmosphereTopKm;
  // dot(normalize(camLocal), sun) — cos of the sun's zenith angle at the camera.
  // radius > 0 whenever the camera is off the body centre (always, in practice);
  // guard the divide so a degenerate centre pose bakes a defined (nadir) value.
  const sunZenithCos =
    radius > 0 ? (camLocal[0] * sun[0] + camLocal[1] * sun[1] + camLocal[2] * sun[2]) / radius : 0;

  // f32 [viewHeightKm, sunZenithCos, _pad0, _pad1] — the 16-byte SkyViewParams
  // record the renderer writes verbatim (see AtmosphereShellRenderer.d.ts).
  renderer.encodeSkyView(encoder, new Float32Array([viewHeightKm, sunZenithCos, 0, 0]));
}
