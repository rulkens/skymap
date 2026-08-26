/**
 * encodeAtmosphereSkyView — unit tests for the per-frame sky-view LUT bake.
 *
 * The load-bearing assertion is the `SkyViewParams` packing contract
 * (AtmosphereShellRenderer.d.ts): the renderer writes the 16-byte record
 * VERBATIM, so a mis-pack silently mis-indexes the LUT (the GPU never reports
 * it; on iOS it drops the frame). We pin the three live fields —
 * `viewHeightKm = |camPosLocal| × atmosphereTopKm` at slot 0,
 * `sunZenithCos = dot(normalize(camPosLocal), sunDirLocal)` at slot 1, and the
 * body's `twilightSoftness` params-row value at slot 2 — by recomputing them from
 * the contract's formula, so a slot swap, a dropped `× atmosphereTopKm`, or a
 * surface-vs-atmosphere-top radius choice lands as a failure here. Slots 2 + 3
 * pack the body's `AtmosphereParams` twilight softness + intensity for every body.
 *
 * The other load-bearing assertion is the SOURCE of the camera altitude: the
 * bake must read the RENDERED pose (`ctx.drawCamPos`) — the exact vector the
 * shell fragment marches along — NOT `state.cam.position`, the drag register
 * that goes stale between gestures (scroll-zoom, tweens, tours). The fixture
 * seeds DIFFERENT positions in the two places and the packing test recomputes
 * from `ctx.drawCamPos`, so a regression to the stale source fails here.
 *
 * The bake iterates the SAME `atmosphereDrawList` the shell draw walks, so
 * bake↔draw is equality — the shell bakes iff it draws. The bake fixture is
 * therefore sized supra-pixel (the list applies the sub-pixel disc cull) so the
 * packing case reaches an entry. We check the three no-op paths (null renderer /
 * camera beyond the near-field distance gate / unseeded Earth), each an empty list.
 */

import { describe, it, expect, vi } from 'vitest';

import { encodeAtmosphereSkyView } from '../../../../src/services/engine/frame/encodeAtmosphereSkyView';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ATMOSPHERE_PARAMS } from '../../../../src/data/bodies/atmosphereParams';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { camPosLocal } from '../../../../src/utils/camera/camPosLocal';
import { sunDirLocal } from '../../../../src/utils/camera/sunDirLocal';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// The bake resolves each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id, via `atmosphereDrawList`). Stub it to a map
// built from the SeededBody fixtures, REUSING each fixture's own positionMpc/
// orientation refs — so the bake reads the exact fixture values (identity-equal),
// keeping the SkyViewParams recompute below bit-for-bit while the reads move off
// the baked record fields.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
    for (const b of (state.data.bodies.planets ?? []) as readonly SeededPlanet[]) {
      m.set(b.id, { positionMpc: b.positionMpc, orientation: b.orientation, meanAnomalyRad: 0 });
    }
    const earth = state.data.bodies.earth as SeededEarth | null;
    if (earth)
      m.set(earth.id, {
        positionMpc: earth.positionMpc,
        orientation: earth.orientation,
        meanAnomalyRad: 0,
      });
    return m;
  }),
}));

// Test fixtures pairing the identity records with the J2000 state the snapshot
// carries — position + orientation were lifted off the record onto the derive, so
// the fixtures supply them here (Earth's sourced from the derive so the values are
// the real J2000 ones; refs stay stable across the mock + the recompute).
type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
type SeededPlanet = PlanetBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const EARTH_STATE = deriveBodyStates(CONST_J2000).get('earth')!;
const SEEDED_EARTH: SeededEarth = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

const encoder = {} as unknown as GPUCommandEncoder;

/** A spy atmosphere renderer — only `encodeSkyView` is exercised here. */
function spyRenderer(): { encodeSkyView: ReturnType<typeof vi.fn> } {
  return { encodeSkyView: vi.fn() };
}

/**
 * Assemble the minimal EngineState the encode reads: the renderer handle off
 * `gpu` and the seeded bodies off `data.bodies`. The twilight softness + intensity
 * come from each body's `AtmosphereParams` row, so no settings are read.
 * `atmosphereDrawList` spreads `bodies.planets`, so seed it empty (only Earth
 * carries an atmosphere row today). `camStalePosition` is threaded onto
 * `state.cam.position` — the STALE drag register the encode must NOT read.
 */
function makeState(init: {
  renderer: unknown;
  earth?: EarthBody | null;
  camStalePosition?: Vec3;
}): EngineState {
  const cam = init.camStalePosition == null ? null : { position: init.camStalePosition };
  return {
    gpu: { atmosphereShellRenderer: init.renderer },
    data: {
      bodies: { earth: 'earth' in init ? (init.earth ?? null) : SEEDED_EARTH, planets: [] },
    },
    cam,
  } as unknown as EngineState;
}

/**
 * The minimal ReadyFrameContext the encode reads: `drawCamPos` (the RENDERED pose
 * the shell fragment marches along, the source the bake derives its altitude
 * from), `cam.distance` (the near-field distance gate), and `canvasSize` +
 * `fovYRad` (the sub-pixel disc cull `atmosphereDrawList` applies). `camDistance`
 * defaults to 0 — inside the near-field edge, the common Earth-framed path. The
 * viewport is sized so the `CAM_POS_RENDERED` disc resolves well above sub-pixel,
 * clearing the cull the bake now shares with the draw.
 */
function makeCtx(drawCamPos: Vec3, camDistance = 0): ReadyFrameContext {
  return {
    drawCamPos,
    cam: { distance: camDistance },
    canvasSize: { width: 1920, height: 1080 },
    fovYRad: Math.PI / 4,
  } as unknown as ReadyFrameContext;
}

// The RENDERED pose (what the shell fragment sees) — a few Earth radii off the
// centre, along +x from Earth's position, so camPosLocal has a clear non-zero
// radius the packing can be checked against.
const CAM_POS_RENDERED: Vec3 = [
  SEEDED_EARTH.positionMpc[0] + 5 * SEEDED_EARTH.radiusM * SCALE_UNITS.M_TO_MPC,
  SEEDED_EARTH.positionMpc[1],
  SEEDED_EARTH.positionMpc[2],
];

// The STALE drag register on `state.cam.position` — a DIFFERENT altitude (20
// Earth radii out, along +z). If the bake regressed to reading this, both the
// packed viewHeightKm and sunZenithCos would differ from the recompute below.
const CAM_POS_STALE: Vec3 = [
  SEEDED_EARTH.positionMpc[0],
  SEEDED_EARTH.positionMpc[1],
  SEEDED_EARTH.positionMpc[2] + 20 * SEEDED_EARTH.radiusM * SCALE_UNITS.M_TO_MPC,
];

describe('encodeAtmosphereSkyView', () => {
  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    expect(() =>
      encodeAtmosphereSkyView(
        encoder,
        makeCtx(CAM_POS_RENDERED),
        makeState({ renderer: null, camStalePosition: CAM_POS_STALE }),
      ),
    ).not.toThrow();
  });

  it('is a no-op when the camera is beyond the near-field distance gate', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx(CAM_POS_RENDERED, FOREGROUND_MAX_DISTANCE_MPC),
      makeState({ renderer, camStalePosition: CAM_POS_STALE }),
    );
    expect(renderer.encodeSkyView).not.toHaveBeenCalled();
  });

  it('is a no-op when bodies.earth is unseeded', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx(CAM_POS_RENDERED),
      makeState({ renderer, earth: null, camStalePosition: CAM_POS_STALE }),
    );
    expect(renderer.encodeSkyView).not.toHaveBeenCalled();
  });

  it('bakes the SkyViewParams from ctx.drawCamPos (the rendered pose), NOT the stale state.cam.position', () => {
    const renderer = spyRenderer();
    // state.cam.position holds a DIFFERENT (stale) altitude than the rendered
    // pose in ctx.drawCamPos — the bake must derive its packing from the latter.
    encodeAtmosphereSkyView(
      encoder,
      makeCtx(CAM_POS_RENDERED),
      makeState({ renderer, camStalePosition: CAM_POS_STALE }),
    );

    expect(renderer.encodeSkyView).toHaveBeenCalledTimes(1);
    const [encoderArg, bodyIdArg, uniforms] = renderer.encodeSkyView.mock.calls[0]! as [
      GPUCommandEncoder,
      string,
      Float32Array,
    ];
    expect(encoderArg).toBe(encoder);
    expect(bodyIdArg).toBe(SEEDED_EARTH.id);
    expect(uniforms).toBeInstanceOf(Float32Array);
    expect(uniforms).toHaveLength(4);

    // Independent recompute from the contract's formula, using the RENDERED pose.
    // The camera is expressed in ATMOSPHERE-TOP-radius units (NOT surface radius);
    // its length × the atmosphere-top km recovers the camera radius in km.
    const params = ATMOSPHERE_PARAMS['earth']!;
    const atmosphereTopMpc = params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC;
    const camLocal = camPosLocal(
      CAM_POS_RENDERED,
      SEEDED_EARTH.positionMpc,
      atmosphereTopMpc,
      SEEDED_EARTH.orientation,
    );
    const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
    const sun = sunDirLocal(SEEDED_EARTH.positionMpc, RENDER_ORIGIN_MPC, SEEDED_EARTH.orientation);
    const expectedViewHeightKm = radius * params.atmosphereTopKm;
    const expectedSunZenithCos =
      (camLocal[0] * sun[0] + camLocal[1] * sun[1] + camLocal[2] * sun[2]) / radius;

    // The encode narrows this exact f64 expression once at the Float32Array
    // write, so the slot equals Math.fround of the recomputed value bit-for-bit
    // (the values are ~3e4 km, where toBeCloseTo's absolute tolerance is
    // meaningless — the same posture earthLayer.test uses for camPosLocal).
    expect(uniforms[0]).toBe(Math.fround(expectedViewHeightKm));
    expect(uniforms[1]).toBe(Math.fround(expectedSunZenithCos));

    // Guard against a regression to the stale source: the stale pose would pack a
    // strictly larger view height (20 vs 5 radii out), so pin that the packed
    // value tracks the rendered pose and NOT the stale register.
    const staleLocal = camPosLocal(
      CAM_POS_STALE,
      SEEDED_EARTH.positionMpc,
      atmosphereTopMpc,
      SEEDED_EARTH.orientation,
    );
    const staleViewHeightKm =
      Math.hypot(staleLocal[0], staleLocal[1], staleLocal[2]) * params.atmosphereTopKm;
    expect(uniforms[0]).not.toBe(Math.fround(staleViewHeightKm));

    // The camera five radii out sits well above the surface, so the LUT's view
    // height must clear the ground radius — a guard against a surface-radius
    // mis-scale that would collapse the altitude.
    expect(uniforms[0]!).toBeGreaterThan(params.planetRadiusKm);
    // Slots 2 + 3 carry the body's `AtmosphereParams` twilight softness + intensity
    // — packed from the params row for every body.
    expect(uniforms[2]).toBe(Math.fround(params.twilightSoftness));
    expect(uniforms[3]).toBe(Math.fround(params.twilightIntensity));
  });
});
