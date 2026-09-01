/**
 * encodeAtmosphereSkyView — unit tests for the per-frame sky-view LUT bake.
 *
 * The load-bearing assertion is the `SkyViewParams` packing contract
 * (AtmosphereShellRenderer.d.ts): the renderer writes the 16-byte record
 * VERBATIM, so a mis-pack silently mis-indexes the LUT (the GPU never reports
 * it; on iOS it drops the frame). We pin the three live fields —
 * `viewHeightKm = |camLocal| × atmosphereTopKm` at slot 0,
 * `sunZenithCos = dot(normalize(camLocal), sunDirLocal)` at slot 1, and the
 * body's `twilightSoftness` params-row value at slot 2 — by recomputing them
 * from the contract's formula, so a slot swap, a dropped `× atmosphereTopKm`,
 * or a surface-vs-atmosphere-top radius choice lands as a failure here. Slots
 * 2 + 3 pack the body's `AtmosphereParams` twilight softness + intensity for
 * every body.
 *
 * The other load-bearing assertion is the SOURCE of the camera altitude (the
 * M1 fix): the bake must derive `camLocal` via `bodySlabCamLocal` from
 * `ctx.bodyPose(body.id)` — the SAME body-slab pose seam `atmosphereShellLayer`
 * reads for its fragment — NOT a second Mpc-side re-derivation off
 * `ctx.drawCamPos`/`state.cam.position`. The packing test recomputes from the
 * pose fixture directly, and a dedicated test proves a null pose is a per-body
 * skip rather than a crash or a silent fall-back to some other source.
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
import { bodySlabCamLocal } from '../../../../src/utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../../src/utils/camera/sunDirLocal';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// The bake resolves each body's live position/orientation from the per-frame
// body-state snapshot (keyed by id, via `atmosphereDrawList`) for `sunDirLocal`
// — unrelated to the M1 fix (the camera altitude now comes from `ctx.bodyPose`
// instead). Stub it to a map built from the SeededBody fixtures, REUSING each
// fixture's own positionMpc/orientation refs, keeping the sun-direction
// recompute bit-for-bit.
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
 * carries an atmosphere row today).
 */
function makeState(init: { renderer: unknown; earth?: EarthBody | null }): EngineState {
  return {
    gpu: { atmosphereShellRenderer: init.renderer },
    data: {
      bodies: { earth: 'earth' in init ? (init.earth ?? null) : SEEDED_EARTH, planets: [] },
    },
  } as unknown as EngineState;
}

/** A `BodyPoseProvider` stub returning one fixed pose for 'earth', null otherwise. */
function makeBodyPose(eyeRelBodyM: Vec3 | null): BodyPoseProvider {
  return (bodyId) =>
    bodyId === 'earth' && eyeRelBodyM !== null
      ? { eyeRelBodyM, basisM: [...IDENTITY_MAT3] as Mat3 }
      : null;
}

/**
 * The minimal ReadyFrameContext the encode reads: `bodyPose` (the M1 seam the
 * camera altitude now derives from), `drawCamPos` + `cam.distance` (still read
 * by `atmosphereDrawList`'s OWN near-field + sub-pixel disc culls, decoupled
 * from the sky-view math itself), and `canvasSize` + `fovYRad` (that same
 * cull). `camDistance` defaults to 0 — inside the near-field edge, the common
 * Earth-framed path. `drawCamPos` is sized so Earth's disc resolves well above
 * sub-pixel, clearing the cull the bake shares with the draw.
 */
function makeCtx(input: {
  bodyPose: BodyPoseProvider;
  drawCamPos?: Vec3;
  camDistance?: number;
}): ReadyFrameContext {
  return {
    bodyPose: input.bodyPose,
    drawCamPos: input.drawCamPos ?? DRAW_CAM_POS,
    cam: { distance: input.camDistance ?? 0 },
    canvasSize: { width: 1920, height: 1080 },
    fovYRad: Math.PI / 4,
  } as unknown as ReadyFrameContext;
}

// Clears `atmosphereDrawList`'s sub-pixel disc cull — a few Earth radii off the
// centre, along +x, in Mpc (unrelated to the pose fixture below: this only
// feeds the CULL, not the sky-view math).
const DRAW_CAM_POS: Vec3 = [
  SEEDED_EARTH.positionMpc[0] + 5 * SEEDED_EARTH.radiusM * SCALE_UNITS.M_TO_MPC,
  SEEDED_EARTH.positionMpc[1],
  SEEDED_EARTH.positionMpc[2],
];

// The rendered pose (what `atmosphereShellLayer`'s fragment sees): the camera
// 5 Earth radii out along the body's local +x axis, in METRES — already in the
// body-fixed frame the seam promises, so the recompute below needs no
// orientation matrix multiply of its own.
const EYE_REL_BODY_M: Vec3 = [5 * SEEDED_EARTH.radiusM, 0, 0];

describe('encodeAtmosphereSkyView', () => {
  it('is a no-op when the renderer handle is null (pre-bootstrap)', () => {
    expect(() =>
      encodeAtmosphereSkyView(
        encoder,
        makeCtx({ bodyPose: makeBodyPose(EYE_REL_BODY_M) }),
        makeState({ renderer: null }),
      ),
    ).not.toThrow();
  });

  it('is a no-op when the camera is beyond the near-field distance gate', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx({
        bodyPose: makeBodyPose(EYE_REL_BODY_M),
        camDistance: FOREGROUND_MAX_DISTANCE_MPC,
      }),
      makeState({ renderer }),
    );
    expect(renderer.encodeSkyView).not.toHaveBeenCalled();
  });

  it('is a no-op when bodies.earth is unseeded', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx({ bodyPose: makeBodyPose(EYE_REL_BODY_M) }),
      makeState({ renderer, earth: null }),
    );
    expect(renderer.encodeSkyView).not.toHaveBeenCalled();
  });

  it('skips a body whose ctx.bodyPose resolves null this frame, rather than crashing (fail-safe guard)', () => {
    // `atmosphereDrawList` and `ctx.bodyPose` share one body-state map in
    // production, so this never actually fires there — but the bake must not
    // assume it, since the two are two independent reads of that map.
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx({ bodyPose: makeBodyPose(null) }),
      makeState({ renderer }),
    );
    expect(renderer.encodeSkyView).not.toHaveBeenCalled();
  });

  it('bakes the SkyViewParams from ctx.bodyPose (the M1 body-slab pose seam), via bodySlabCamLocal', () => {
    const renderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx({ bodyPose: makeBodyPose(EYE_REL_BODY_M) }),
      makeState({ renderer }),
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

    // Independent recompute from the contract's formula, using the SAME
    // `bodySlabCamLocal` util the encode (and `atmosphereShellLayer`'s
    // fragment-facing draw) calls — the camera is expressed in
    // ATMOSPHERE-TOP-radius units (NOT surface radius); its length ×
    // the atmosphere-top km recovers the camera radius in km.
    const params = ATMOSPHERE_PARAMS['earth']!;
    const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    const camLocal = bodySlabCamLocal(EYE_REL_BODY_M, atmosphereTopM);
    const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
    const sun = sunDirLocal(SEEDED_EARTH.positionMpc, RENDER_ORIGIN_MPC, SEEDED_EARTH.orientation);
    const expectedViewHeightKm = radius * params.atmosphereTopKm;
    const expectedSunZenithCos =
      (camLocal[0] * sun[0] + camLocal[1] * sun[1] + camLocal[2] * sun[2]) / radius;

    // The encode narrows this exact f64 expression once at the Float32Array
    // write, so the slot equals Math.fround of the recomputed value bit-for-bit
    // (the values are ~3e4 km, where toBeCloseTo's absolute tolerance is
    // meaningless — the same posture earthLayer.test uses for bodySlabCamLocal).
    expect(uniforms[0]).toBe(Math.fround(expectedViewHeightKm));
    expect(uniforms[1]).toBe(Math.fround(expectedSunZenithCos));

    // A different pose (20 Earth radii out, along local +z) must pack a
    // strictly different, larger view height — pins that the packed value
    // actually tracks `ctx.bodyPose`, not a fixed/ignored input.
    const fartherPose: Vec3 = [0, 0, 20 * SEEDED_EARTH.radiusM];
    const fartherRenderer = spyRenderer();
    encodeAtmosphereSkyView(
      encoder,
      makeCtx({ bodyPose: makeBodyPose(fartherPose) }),
      makeState({ renderer: fartherRenderer }),
    );
    const fartherUniforms = fartherRenderer.encodeSkyView.mock.calls[0]![2] as Float32Array;
    expect(fartherUniforms[0]).toBeGreaterThan(uniforms[0]!);

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
