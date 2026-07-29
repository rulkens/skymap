/**
 * earthLayer — the true-scale, Blue-Marble-textured Earth as a content-layer
 * row drawing into the depth-bearing `foreground:0` target.
 *
 * ### What it draws
 *
 * The single seeded `bodies.earth` record, composed as a unit sphere scaled to
 * the body's radius (`radiusKm` → Mpc via `SCALE_UNITS.KM_TO_MPC`) and
 * translated to its `positionMpc`, in the `RENDER_ORIGIN_MPC`-relative frame.
 * The layer packs the 128-byte `EarthSurfaceUniforms` record (MVP + body-local
 * sun direction + camera-in-local-frame + the PBR surface params, including the
 * user-tunable night-side ambient floor `settings.earth.ambientLight` and the
 * user-tunable open-water roughness `settings.earth.oceanRoughness` — both
 * Earth-scoped overrides of the WESL consts other bodies read);
 * `earthRenderer.draw` writes it into its single
 * (non-dynamic) uniform buffer and issues one indexed draw — so this row must
 * draw the Earth AT MOST once per frame (the renderer's own header spells out
 * the `writeBuffer`-vs-`submit` race a second same-frame draw would trigger).
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Like the other sphere-body layers (`starSpheresLayer`, `planetsLayer`),
 * this is a near-field body that reads the slab's `Float64Array`
 * view-projection (`view.slab.vp`) rather than the f32-narrowed
 * `view.vp` every cosmological layer consumes. Earth sits ~1 AU ≈ 4.85e-12 Mpc
 * from the render origin, a tiny number the VP's large translation nearly
 * cancels. `composeBodyMvp` must resolve that cancellation in double precision
 * BEFORE narrowing to f32 — feeding it `view.vp` (already narrowed by
 * `slabViewOf`) would resolve the cancellation after the low-order bits are
 * gone, silently mis-placing Earth by more than its own radius. See
 * `composeBodyMvp`'s module header for the full compose-in-f64-then-narrow
 * argument.
 *
 * ### When it draws
 *
 * `enabled` gates on TWO handles — the `earthRenderer` GPU handle (null in the
 * pre-bootstrap window) AND the seeded `bodies.earth` record (null until the
 * scene-body seed installs it) — plus the shared near-field distance gate
 * (`FOREGROUND_MAX_DISTANCE_MPC`): beyond it Earth is a deep-sub-pixel speck
 * at the galactic centre, and gating here (with every NEAR0 sibling) lets the
 * executor skip the whole foreground pass group as empty. Inside that gate a
 * sub-pixel cull (`SUB_PIXEL_BODY_CULL_PX`) still applies: Earth spends most
 * of the descent under a pixel across, where the sphere draw adds nothing the
 * star-point backdrop doesn't already show. The `foreground:0` target is a
 * bootstrap-guaranteed `renderTargets` row, so there is no separate
 * offscreen-null gate. `draw` re-checks both handles so a stale call is a
 * harmless no-op.
 *
 * `RENDER_ORIGIN_MPC` is imported directly as a constant (not threaded through
 * ctx state) — the render origin is fixed at the Sun for the zoom-to-earth
 * fold.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { Source } from '../../../../data/sources';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { camPosLocal } from '../../../../utils/camera/camPosLocal';
import { packEarthSurfaceUniforms } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { EARTH_SURFACE_PARAMS } from '../../../../data/bodies/earthSurfaceParams';
import { CLOUD_SHELL_PARAMS } from '../../../../data/bodies/cloudShellParams';
import { apparentSizePx } from '../../../../utils/math/apparentSizePx';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../foregroundMaxDistance';
import { SUB_PIXEL_BODY_CULL_PX } from '../subPixelBodyCullPx';
import { drawFlooredSpherePick } from '../../helpers/drawFlooredSpherePick';
import { sceneBodyStates } from '../sceneBodyStates';

export const earthLayer: ContentLayer = {
  name: 'earth',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'opaque',

  enabled(state, ctx) {
    // Handle first (pre-bootstrap fixtures carry a bare ctx), then the shared
    // near-field distance gate, then the seeded body. The target is a
    // bootstrap-guaranteed renderTargets row.
    if (state.gpu.earthRenderer === null) return false;
    if (ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC) return false;
    const earth = state.data.bodies.earth;
    if (earth === null) return false;
    // Live position from the per-frame snapshot (keyed by id) — not the baked
    // record field; the record still gates presence + carries the authored radius.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;
    // Sub-pixel cull: below SUB_PIXEL_BODY_CULL_PX apparent diameter the
    // sphere cannot resolve, so drop the layer from the pass plan entirely
    // (see that constant's docblock). Earth is the layer's only body, so the
    // whole-layer gate is exact — unlike planetsLayer, whose per-body cull
    // lives in its pack loop. A zero camera-to-centre distance means the
    // camera is INSIDE the body — apparentSizePx defensively returns 0
    // there, which would read as sub-pixel, so treat it as resolved.
    const dx = earthState.positionMpc[0] - ctx.drawCamPos[0];
    const dy = earthState.positionMpc[1] - ctx.drawCamPos[1];
    const dz = earthState.positionMpc[2] - ctx.drawCamPos[2];
    const distanceMpc = Math.hypot(dx, dy, dz);
    if (distanceMpc === 0) return true;
    const diameterPx = apparentSizePx({
      diameterKpc: (2 * earth.radiusKm * SCALE_UNITS.KM_TO_MPC) / SCALE_UNITS.KPC_TO_MPC,
      distanceMpc,
      viewportHeightPx: ctx.canvasSize.height,
      fovYRad: ctx.fovYRad,
    });
    return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.earthRenderer;
    const earth = state.data.bodies.earth;
    if (renderer === null || earth === null) return;

    // Live position + orientation from the per-frame snapshot (keyed by id) —
    // not the baked record fields; radius stays authored identity on the record.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;

    // Compose the Earth's MVP from the slab's f64 vp — see the module header's
    // "f64 seam" note for why `view.slab.vp` and not `view.vp`. Radius is the
    // authored kilometres resolved into Mpc at the draw site.
    const mvp = composeBodyMvp(
      view.slab.vp,
      earthState.positionMpc,
      RENDER_ORIGIN_MPC,
      earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
      earthState.orientation,
    );
    // Rotate the sun direction into Earth's local frame (its orientation carries
    // the axial tilt), so the fragment's lighting stays a plain dot product. The
    // night-side ambient floor rides the uniform below
    // (`settings.earth.ambientLight`), an Earth-scoped override of the shared
    // AMBIENT const other bodies read.
    const sun = sunDirLocal(earthState.positionMpc, RENDER_ORIGIN_MPC, earthState.orientation);
    // The camera in Earth's local frame (body-radii units) — the view vector the
    // PBR fragment needs for the view-dependent ocean glint. `view.camPos` and
    // the snapshot position are BOTH origin-relative (heliocentric) Mpc — the near
    // slab is origin-relative — so their difference resolves cleanly in JS doubles
    // before narrowing to f32 (the same precision posture as the f64 seam above).
    const camLocal = camPosLocal(
      view.camPos,
      earthState.positionMpc,
      earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
      earthState.orientation,
    );
    // Pack MVP + sunDirLocal + camPosLocal + the PBR surface params into the
    // 128-byte EarthSurfaceUniforms record.
    renderer.draw(
      pass,
      packEarthSurfaceUniforms(
        mvp,
        sun,
        camLocal,
        EARTH_SURFACE_PARAMS.roughnessBase,
        EARTH_SURFACE_PARAMS.f0,
        EARTH_SURFACE_PARAMS.sunIrradiance,
        EARTH_SURFACE_PARAMS.cloudShadowStrength,
        // The cloud deck's unit-sphere local radius — the surface shadow ray
        // intersects this SAME shell the cloudShellLayer draws, so the cast
        // shadow and the drawn deck agree by construction.
        CLOUD_SHELL_PARAMS.radiusRatio,
        // Night-side ambient floor — the live user setting, not the WESL const
        // (seeded from EARTH_SURFACE_PARAMS.ambientLight so the default matches).
        state.settings.earth.ambientLight,
        // Open-water GGX roughness — the live user setting, not the pbr.wesl
        // OCEAN_ROUGHNESS const (seeded from EARTH_SURFACE_PARAMS.oceanRoughness
        // so the default matches).
        state.settings.earth.oceanRoughness,
        // The surface virtual texture's page-table window (zWin, winX0, winY0).
        // All-zero is the identity: every page-table cell reads "no tile", the
        // fragment samples the whole-globe base texture, and the window is never
        // consulted.
        0,
        0,
        0,
      ),
    );
  },

  // Pick aspect — stamps Earth's packed identity into the NEAR0 r32uint pick
  // pass via the shared `bodyPickRenderer`. The pick program only reaches here
  // when `enabled` (the same foreground-distance + sub-pixel gate) passed for
  // the pick-time camera, so the pick sphere is drawn exactly where the visual
  // sphere is. The MVP is composed the SAME way `draw` does — `composeBodyMvp`
  // from the slab's f64 vp (the "f64 seam" note) — so the pick silhouette is
  // identical to the drawn one.
  //
  // Earth is the sole body of its source (`Source.Earth`), so its seed index is
  // the constant 0 — there is no seed table to look up. The packed id is
  // `packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET)`; the offset keeps a
  // real (source, index 0) hit distinct from the cleared-to-zero no-hit texel.
  drawPick(pass, view, ctx, state) {
    const pickRenderer = state.gpu.bodyPickRenderer;
    const earth = state.data.bodies.earth;
    if (pickRenderer === null || earth === null) return;

    // Live position + orientation from the per-frame snapshot (keyed by id) — not
    // the baked record fields; radius stays authored identity on the record.
    const earthState = sceneBodyStates(state, ctx).get(earth.id)!;

    // Floor the PICK radius to the shared min footprint (visual sphere untouched):
    // a far-edge Earth can project to a couple of pixels, too small to click, so
    // its pick sphere inflates to the same 9 px-radius floor the point-partition
    // bodies get — the shared `drawFlooredSpherePick` recipe. Earth carries its
    // snapshot orientation; its identity is the constant seed index 0.
    drawFlooredSpherePick(pickRenderer, pass, {
      vp: view.slab.vp,
      positionMpc: earthState.positionMpc,
      radiusMpc: earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
      camPosMpc: view.camPos,
      drawPxPerRad: ctx.drawPxPerRad,
      orientation: earthState.orientation,
      packedId: packSelection(Source.Earth, 0 + PICK_SENTINEL_OFFSET),
    });
  },
};
