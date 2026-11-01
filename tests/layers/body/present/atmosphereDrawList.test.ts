/**
 * atmosphereDrawList — the ONE per-frame atmosphere draw-list derivation the sky-view bake and the
 * shell draw both consume: `[earth, ...planets]` filtered by an `ATMOSPHERE_PARAMS` row (data gate),
 * an active slab row this frame, and SURFACE disc at/above `SUB_PIXEL_BODY_CULL_PX`.
 * One test per gate so a regression lands as a distinct failure.
 */

import { describe, it, expect, vi } from 'vitest';

import { atmosphereDrawList } from '../../../../src/layers/body/present/atmosphereDrawList';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ATMOSPHERE_PARAMS } from '../../../../src/layers/body/present/atmosphereParams';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import { outerBoundRadiusM } from '../../../../src/utils/occlusion/outerBoundRadiusM';
import type { BodySurface } from '../../../../src/@types/scene/BodySurface';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { SeededBody } from '../../../helpers/frame/SeededBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { SlabRow } from '../../../../src/@types/engine/frame/SlabRow';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// Stub with the real states plus the Earth fixture below, REUSING its positionMpc/orientation
// refs so the list resolves identity-equal values.
vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [SEEDED_EARTH])),
}));

const EARTH_STATE = deriveBodyStates(CONST_J2000).get(asSceneBodyId('earth'))!;
const SEEDED_EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: EARTH_STATE.positionMpc,
  orientation: EARTH_STATE.orientation,
};

// 1080-px viewport, fovYRad 1.0, tangent-exact — matches `symmetricFrustum`'s
// form so the fixture's `drawPxPerRad` is what `deriveView` would have set.
const FIXTURE_PX_PER_RAD = 1080 / (2 * Math.tan(1.0 / 2));

/**
 * The minimal FrameView the derivation reads: `drawCamPos`, the frame's active slab rows,
 * `drawPxPerRad` and `bodyPose`. Every body row is active by default.
 */
function makeCtx(
  drawCamPos: Vec3,
  bodyPose: BodyPoseProvider = poseFrom(drawCamPos),
  slabBodyCandidates: readonly SlabRow[] = BODY_SLAB_ROWS,
): FrameView {
  return {
    drawCamPos,
    snapshot: { slabBodyCandidates },
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    bodyPose,
  } as unknown as FrameView;
}

/**
 * A pose stub re-expressing `drawCamPos` as Earth's body-relative metre offset,
 * on an identity basis — so a `camRadiiOut` camera sits at the same radii in the
 * local frame the entry's `camLocal` is built in.
 */
function poseFrom(drawCamPos: Vec3): BodyPoseProvider {
  const eyeRelBodyM = drawCamPos.map(
    (c, i) => (c - SEEDED_EARTH.positionMpc[i]!) * SCALE_UNITS.MPC_TO_M,
  ) as Vec3;
  return () => ({ eyeRelBodyM, basisM: [...IDENTITY_MAT3] as Mat3 });
}

/** A camera pose `radii` Earth-radii out from `body` along +x — sets the disc size. */
function camRadiiOut(body: { positionMpc: Vec3; surface: BodySurface }, radii: number): Vec3 {
  return [
    body.positionMpc[0] + radii * outerBoundRadiusM(body.surface) * SCALE_UNITS.M_TO_MPC,
    body.positionMpc[1],
    body.positionMpc[2],
  ];
}

// The list reads only ctx and the static scene tables; `state` is the pass-state it is handed.
const STATE = {} as unknown as EngineState;

describe('atmosphereDrawList', () => {
  it('includes a body with a row, in near-field range, and a supra-pixel disc', () => {
    const list = atmosphereDrawList(STATE, makeCtx(camRadiiOut(SEEDED_EARTH, 5)));
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe(SCENE_EARTH);
    expect(list[0]!.params).toBe(ATMOSPHERE_PARAMS['earth']);
  });

  it('lists no body whose slab row is inactive', () => {
    // Close enough to draw, but the frame yielded Earth's row: the sky-view bake and the
    // shell must not work off a body that has no slab to draw on.
    const eye = camRadiiOut(SEEDED_EARTH, 5);
    const withoutEarth = BODY_SLAB_ROWS.filter((row) => row.anchorId !== SCENE_EARTH.id);
    const list = atmosphereDrawList(STATE, makeCtx(eye, poseFrom(eye), withoutEarth));
    expect(list).toHaveLength(0);
  });

  it('excludes a body whose disc is sub-pixel', () => {
    // ~3000 radii out drops the disc under one pixel at this fov/height, while
    // the camera stays inside the near-field edge (still a sub-picometre Mpc).
    const list = atmosphereDrawList(STATE, makeCtx(camRadiiOut(SEEDED_EARTH, 3000)));
    expect(list).toHaveLength(0);
  });

  it('includes Earth when the camera is deep inside the atmosphere shell', () => {
    // Half an Earth radius out: well inside the shell, yet a supra-pixel disc. The sub-pixel cull
    // must not exclude a body the camera sits deep inside (spec §4.6).
    const list = atmosphereDrawList(STATE, makeCtx(camRadiiOut(SEEDED_EARTH, 0.5)));
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe(SCENE_EARTH);
  });

  it('flags the entry inside when the camera is within the shell handoff ratio', () => {
    // The flag selects the shell's full-screen render path, so it must track the
    // camera. Half an Earth radius out is 0.5 × 6371/6471 ≈ 0.49 atmosphere-top
    // radii — under the 1.005 handoff; five radii out is ≈ 4.92, far over it.
    const near = atmosphereDrawList(STATE, makeCtx(camRadiiOut(SEEDED_EARTH, 0.5)));
    expect(near[0]!.inside).toBe(true);
    const far = atmosphereDrawList(STATE, makeCtx(camRadiiOut(SEEDED_EARTH, 5)));
    expect(far[0]!.inside).toBe(false);
  });

  it('derives one list per frame context, and re-derives for the next', () => {
    const state = STATE;
    const ctxA = makeCtx(camRadiiOut(SEEDED_EARTH, 5));
    // The identity every consumer leans on: they walk the SAME array, so a memo
    // keyed on anything per-call would hand them separate answers.
    expect(atmosphereDrawList(state, ctxA)).toBe(atmosphereDrawList(state, ctxA));
    // A key outliving the frame would serve ctxA's answer to the next frame — a
    // body the camera has since left behind, baked into that frame's LUT.
    const ctxB = makeCtx(camRadiiOut(SEEDED_EARTH, 3000));
    expect(atmosphereDrawList(state, ctxB)).toEqual([]);
  });

  it('excludes a body with no pose this frame', () => {
    // The derived fields all hang off the pose, so a poseless body cannot be an
    // entry at all — which is what lets both consumers drop their own guard.
    const list = atmosphereDrawList(
      STATE,
      makeCtx(camRadiiOut(SEEDED_EARTH, 5), () => null),
    );
    expect(list).toEqual([]);
  });
});
