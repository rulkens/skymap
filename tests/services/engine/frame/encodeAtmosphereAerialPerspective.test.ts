/**
 * encodeAtmosphereAerialPerspective — unit tests for the per-frame froxel-
 * volume bake. `composeBodySlabMvp` and `bodySlabCamLocal` are mocked to fixed
 * values (the `atmosphereShellPass.test.ts` pattern) — their own math is
 * covered by their own test files, and a camLocal magnitude under 1.0 is what
 * routes a body through `inside` here rather than through the outside-shell
 * pass.
 *
 * The load-bearing assertions are the three gates: no inside body and a null
 * renderer both skip the pass AND the timing claim (a claimed-but-unopened
 * slot reports stale ticks — see `encodeAtmosphereSkyView`'s header), and the
 * null-renderer case must short-circuit before any body input is touched, so
 * a bare/pre-bootstrap ctx never throws.
 */

import { describe, it, expect, vi } from 'vitest';

import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../../src/data/bodies/atmosphereParams';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { makeSlab } from '../../../fixtures/makeSlab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { EarthBody } from '../../../../src/@types/scene/EarthBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// 720-px viewport, 60° fovY, tangent-exact — the apparent-size gate's scale.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

// A camLocal magnitude of 0.5 sits well inside the shell's ~1.005 entry ratio
// — `atmosphereDrawList` reads `inside: true` off it for every body.
const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.5, 0, 0];
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));

import { encodeAtmosphereAerialPerspective } from '../../../../src/services/engine/frame/encodeAtmosphereAerialPerspective';

// atmosphereDrawList reads live body positions off this per-frame snapshot
// (unmocked — its own cull math is covered elsewhere); stub it to the fixture's
// own positionMpc/orientation, the `atmosphereShellPass.test.ts` pattern.
type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;
const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];
// Positioned a hair off the render origin so the apparent-size cull clears
// comfortably (apparent diameter tracks 1/distance) without real orbital math.
const SEEDED_EARTH: SeededEarth = {
  ...SCENE_EARTH,
  positionMpc: [-1e-15, 0, 0],
  orientation: IDENTITY_MAT3,
};
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn((state: EngineState): ReadonlyMap<string, BodyState> => {
    const m = new Map<string, BodyState>();
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

/** The one compute pass the encode opens when it bakes at all. */
const computePass = { end: vi.fn() } as unknown as GPUComputePassEncoder;
const beginComputePass = vi.fn((_descriptor?: GPUComputePassDescriptor) => computePass);
const encoder = { beginComputePass } as unknown as GPUCommandEncoder;

function spyRenderer(): { bakeAerialPerspective: ReturnType<typeof vi.fn> } {
  return { bakeAerialPerspective: vi.fn() };
}

const STUB_POSE = { eyeRelBodyM: [1, 2, 3] as Vec3, basisM: IDENTITY_MAT3 };

function makeBodyPose(): BodyPoseProvider {
  return (bodyId) => (bodyId === 'earth' ? STUB_POSE : null);
}

/** A ctx comfortably inside the shared foreground gate, carrying the one
 *  body-m slab `bodyRowSlabs` resolves `insideAtmosphere` against. Array
 *  position matches the slab's own `index` field (the `FrameView.slabs`
 *  invariant), so indexing `ctx.slabs` by that field lands on this row. */
function makeCtx(withEarthSlab: boolean): FrameView {
  const slabs = withEarthSlab
    ? [makeSlab({ index: 0, frame: { kind: 'body-m', bodyId: 'earth' } })]
    : [];
  return {
    bodyPose: makeBodyPose(),
    drawCamPos: [0, 0, 0],
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    slabs,
  } as unknown as FrameView;
}

function makeState(init: { renderer: unknown; earth?: EarthBody | null }): EngineState {
  return {
    gpu: { atmosphereShellRenderer: init.renderer },
    data: { bodies: { earth: 'earth' in init ? (init.earth ?? null) : SEEDED_EARTH, planets: [] } },
    settings: { earth: { atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure } },
  } as unknown as EngineState;
}

describe('encodeAtmosphereAerialPerspective', () => {
  it('opens no compute pass and never claims the timing slot when no body is inside the shell', () => {
    beginComputePass.mockClear();
    const claim = vi.fn(() => ({}));
    encodeAtmosphereAerialPerspective(
      encoder,
      makeCtx(false),
      makeState({ renderer: spyRenderer(), earth: null }),
      claim,
    );
    expect(beginComputePass).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('bakes the inside body once: one compute pass, one bake call with its id and a 44-float record', () => {
    beginComputePass.mockClear();
    const renderer = spyRenderer();
    const claim = vi.fn(() => ({}));

    encodeAtmosphereAerialPerspective(encoder, makeCtx(true), makeState({ renderer }), claim);

    expect(beginComputePass).toHaveBeenCalledTimes(1);
    expect(beginComputePass.mock.calls[0]![0]).toMatchObject({ label: 'atmosphere-aerial-bake' });
    expect(renderer.bakeAerialPerspective).toHaveBeenCalledTimes(1);
    const [passArg, bodyIdArg, uniforms] = renderer.bakeAerialPerspective.mock.calls[0]! as [
      GPUComputePassEncoder,
      string,
      Float32Array,
    ];
    expect(passArg).toBe(computePass);
    expect(bodyIdArg).toBe('earth');
    expect(uniforms).toBeInstanceOf(Float32Array);
    expect(uniforms).toHaveLength(44);
  });

  it('short-circuits on a null renderer before touching a bare ctx’s body inputs', () => {
    beginComputePass.mockClear();
    const claim = vi.fn(() => ({}));
    const bareCtx = {} as FrameView;

    expect(() =>
      encodeAtmosphereAerialPerspective(encoder, bareCtx, makeState({ renderer: null }), claim),
    ).not.toThrow();
    expect(beginComputePass).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });
});
