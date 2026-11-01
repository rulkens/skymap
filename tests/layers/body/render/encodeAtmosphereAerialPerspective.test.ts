/**
 * encodeAtmosphereAerialPerspective — unit tests for the per-frame froxel-
 * volume bake. `composeBodySlabMvp` and `bodySlabCamLocal` are mocked to fixed
 * values (the `atmosphereShellPass.test.ts` pattern) — their own math is
 * covered by their own test files. The stub pose's metre-scale eye is what puts
 * Earth's row inside its band, so the aerial line is open.
 *
 * The load-bearing assertions are the gates: no inside body skips the pass AND
 * the timing claim (a claimed-but-unopened slot reports stale ticks — see
 * `encodeAtmosphereSkyView`'s header).
 */

import { describe, it, expect, vi } from 'vitest';

import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { ATMOSPHERE_PARAMS } from '../../../../src/layers/body/present/atmosphereParams';
import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { makeSlab } from '../../../fixtures/makeSlab';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { SeededBody } from '../../../helpers/frame/SeededBody';
import type { AtmosphereShellRenderer } from '../../../../src/layers/body/@types/AtmosphereShellRenderer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// 720-px viewport, 60° fovY, tangent-exact — the apparent-size gate's scale.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

const MOCK_MVP = new Float64Array(16);
const MOCK_CAM_LOCAL: Vec3 = [0.5, 0, 0];
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => MOCK_MVP),
}));
vi.mock('../../../../src/utils/camera/bodySlabCamLocal', () => ({
  bodySlabCamLocal: vi.fn<() => Vec3>(() => MOCK_CAM_LOCAL),
}));

import { encodeAtmosphereAerialPerspective } from '../../../../src/layers/body/render/encodeAtmosphereAerialPerspective';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// atmosphereDrawList reads body positions off this snapshot; stub it to the fixture's own refs.
const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];
// Positioned a hair off the render origin so the apparent-size cull clears
// comfortably (apparent diameter tracks 1/distance) without real orbital math.
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: [-1e-15, 0, 0],
  orientation: IDENTITY_MAT3,
};
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [SEEDED_EARTH])),
}));

const computePass = { end: vi.fn() } as unknown as GPUComputePassEncoder;
const beginComputePass = vi.fn((_descriptor?: GPUComputePassDescriptor) => computePass);
const encoder = { beginComputePass } as unknown as GPUCommandEncoder;

type SpyRenderer = AtmosphereShellRenderer & { bakeAerialPerspective: ReturnType<typeof vi.fn> };
function spyRenderer(): SpyRenderer {
  return { bakeAerialPerspective: vi.fn() } as unknown as SpyRenderer;
}

const STUB_POSE = { eyeRelBodyM: [1, 2, 3] as Vec3, basisM: IDENTITY_MAT3 };

function makeBodyPose(): BodyPoseProvider {
  return (bodyId) => (bodyId === 'earth' ? STUB_POSE : null);
}

/** A ctx carrying the one body-m slab `bodyRowSlabs` resolves `insideAtmosphere` against;
 *  array position matches the slab's `index` (the `FrameView.slabs` invariant). */
function makeCtx(withEarthSlab: boolean, drawPxPerRad = FIXTURE_PX_PER_RAD): FrameView {
  const slabs = withEarthSlab
    ? [makeSlab({ index: 0, frame: { kind: 'body-m', hostId: asSceneBodyId('earth') } })]
    : [];
  return {
    bodyPose: makeBodyPose(),
    drawCamPos: [0, 0, 0],
    drawPxPerRad,
    slabs,
    snapshot: { slabBodyCandidates: BODY_SLAB_ROWS },
  } as unknown as FrameView;
}

function makeState(): EngineState {
  return {
    slabRows: [],
    settings: { earth: { atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure } },
  } as unknown as EngineState;
}

describe('encodeAtmosphereAerialPerspective', () => {
  it('opens no compute pass and never claims the timing slot when no body is inside the shell', () => {
    beginComputePass.mockClear();
    const claim = vi.fn(() => ({}));
    encodeAtmosphereAerialPerspective(spyRenderer(), encoder, makeCtx(false), makeState(), claim);
    expect(beginComputePass).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it('bakes the inside body once: one compute pass, one bake call with its id and a 44-float record', () => {
    beginComputePass.mockClear();
    const renderer = spyRenderer();
    const claim = vi.fn(() => ({}));

    encodeAtmosphereAerialPerspective(renderer, encoder, makeCtx(true), makeState(), claim);

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

  it('the aerial bake skips a hosting row whose body has no inside entry', () => {
    // The draw list culls on the surface disc, the line on the eye's distance, so the
    // line can be open with no entry: the bake must find none rather than throw mid-frame.
    beginComputePass.mockClear();
    const renderer = spyRenderer();
    const ctx = makeCtx(true, 1e-30);

    expect(() =>
      encodeAtmosphereAerialPerspective(renderer, encoder, ctx, makeState(), vi.fn()),
    ).not.toThrow();
    expect(beginComputePass).not.toHaveBeenCalled();
    expect(renderer.bakeAerialPerspective).not.toHaveBeenCalled();
  });
});
