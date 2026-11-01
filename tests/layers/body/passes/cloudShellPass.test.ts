/**
 * cloudShellPass — Earth's translucent cloud-shell `'body'`-slab content row. Pinned: the pose
 * comes off `ctx.bodyPose(bodyId)` and composes against the slab's f64 `view.slab.vp`; non-Earth
 * rows leave the pass plan (CLOUD_SHELL_PARAMS has no per-body table); `enabled` goes false once
 * the descent fade reaches 0 (house "opacity 0 ⇒ no render" rule) while `draw` carries the fade
 * into the packed opacity; `insideShell` (camera below `CLOUD_SHELL_PARAMS.radiusRatio`) reaches
 * `renderer.draw` unchanged so the renderer picks its front-cull pipeline.
 */

import { describe, it, expect, vi } from 'vitest';

import { cloudShellPass } from '../../../../src/layers/body/passes/cloudShellPass';
import { CLOUD_SHELL_PARAMS } from '../../../../src/layers/body/present/cloudShellParams';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { bodyTextureSlotKey } from '../../../../src/layers/body/load/bodyTextureSlotKey';
import { makeSlab } from '../../../fixtures/makeSlab';
import { seededBodyStates } from '../../../helpers/frame/seededBodyStates';
import type { SeededBody } from '../../../helpers/frame/SeededBody';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';
import type { SceneBodyId } from '../../../../src/@types/scene/SceneBodyId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { BodyRuntime } from '../../../../src/layers/body/@types/BodyRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../src/@types/engine/camera/BodyRelativePose';

// composeBodySlabMvp is mocked; the layer narrows its own f32 copy at the GPU-upload boundary.
vi.mock('../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));
import { composeBodySlabMvp } from '../../../../src/utils/camera/composeBodySlabMvp';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

vi.mock('../../../../src/services/engine/frame/sceneBodyStates', () => ({
  sceneBodyStates: vi.fn(() => seededBodyStates(0, [EARTH])),
}));

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

// Positioned at the render origin (not, say, 1 Mpc out): Earth's radius in Mpc
// is ~2e-16, the same order as f64 epsilon at magnitude 1 — subtracting a
// radius-scale camera offset from a 1 Mpc position would lose the offset
// entirely to roundoff. At the origin, `0 - distanceMpc` is exact for any
// distanceMpc, so the altitude fixtures below are precision-clean.
const EARTH: SeededBody = {
  ...SCENE_EARTH,
  positionMpc: [0, 0, 0],
  orientation: IDENTITY_MAT3,
};

const STUB_POSE: BodyRelativePose = { eyeRelBodyM: [1, 2, 3], basisM: IDENTITY_MAT3 };

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makeBodyView(bodyId: SceneBodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', hostId: bodyId } });
  return {
    slab,
    vp: f32Vp,
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
    window: { originPx: [0, 0], sizePx: [1280, 720] },
  };
}

/** Camera `altitudeRadii` above Earth's surface, straight down -x, inside the foreground gate and
 *  resolved (not sub-pixel), isolating the descent-fade gate from the OTHER gates. */
// 720-px viewport, 60° fovY, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));

function ctxAtAltitude(altitudeRadii: number): FrameView {
  const radiusMpc = EARTH.surface.datumRadiusM * SCALE_UNITS.M_TO_MPC;
  const distanceMpc = radiusMpc * (1 + altitudeRadii);
  return {
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
    drawCamPos: [EARTH.positionMpc[0] - distanceMpc, EARTH.positionMpc[1], EARTH.positionMpc[2]],
    bodyPose: (() => STUB_POSE) as FrameView['bodyPose'],
    drawPxPerRad: FIXTURE_PX_PER_RAD,
  } as unknown as FrameView;
}

function makeFixture(renderer: unknown, resident: boolean) {
  const textureSlots = new Map(
    resident
      ? [[bodyTextureSlotKey('earth', 'clouds'), { current: () => ({}) as ImageBitmap }] as const]
      : [],
  );
  const state = {
    settings: { earth: { ambientLight: 0.08 } },
  } as unknown as EngineState;
  const pass = cloudShellPass({
    cloudShellRenderer: renderer,
    textureSlots,
  } as unknown as BodyRuntime);
  return { state, pass };
}

describe('cloudShellPass.enabled', () => {
  it('is false while the clouds slot is not resident, even well above the fade band', () => {
    const { state, pass } = makeFixture({ draw: vi.fn() }, false);
    expect(pass.enabled(state, ctxAtAltitude(10), makeBodyView(asSceneBodyId('earth')))).toBe(
      false,
    );
  });

  it('is true when resident and well above the fade band', () => {
    const { state, pass } = makeFixture({ draw: vi.fn() }, true);
    expect(pass.enabled(state, ctxAtAltitude(10), makeBodyView(asSceneBodyId('earth')))).toBe(true);
  });

  it('is false once the camera descends below the fade-out altitude — resident and well above sub-pixel notwithstanding', () => {
    // The deck must leave the pass plan once fully faded, not draw at opacity 0. Half the
    // fade-end altitude, not the edge, to stay clear of distance→altitude roundoff.
    const { state, pass } = makeFixture({ draw: vi.fn() }, true);
    const belowFadeFloor = ctxAtAltitude(CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii / 2);
    expect(pass.enabled(state, belowFadeFloor, makeBodyView(asSceneBodyId('earth')))).toBe(false);
  });

  it('is false for a body-m row that is not Earth’s own, even resident and well above the fade band', () => {
    // CLOUD_SHELL_PARAMS has no per-body table, so every non-Earth row leaves the pass plan.
    const { state, pass } = makeFixture({ draw: vi.fn() }, true);
    expect(pass.enabled(state, ctxAtAltitude(10), makeBodyView(asSceneBodyId('mars')))).toBe(false);
  });
});

describe('cloudShellPass.draw', () => {
  it('scales the packed opacity by the descent fade partway through the band', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy }, true);
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const ctx = ctxAtAltitude(midAltitudeRadii);
    const view = makeBodyView(asSceneBodyId('earth'));

    pass.draw(PASS_STUB, view, ctx, state);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [, uniforms] = drawSpy.mock.calls[0]!;
    // Float index 19 (byte 76) is cloudOpacity per packCloudShellUniforms; strictly between 0
    // and the authored dial (camera mid-band).
    expect(uniforms[19]).toBeGreaterThan(0);
    expect(uniforms[19]).toBeLessThan(CLOUD_SHELL_PARAMS.opacity);
  });

  it('passes insideShell as the third draw() argument — false above the shell radius, true below it', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy }, true);
    const view = makeBodyView(asSceneBodyId('earth'));

    pass.draw(PASS_STUB, view, ctxAtAltitude(10), state);
    // Below radiusRatio − 1 (0.002) yet above the fade floor (0.0005): deck visible AND camera inside the shell.
    pass.draw(PASS_STUB, view, ctxAtAltitude(0.001), state);

    expect(drawSpy).toHaveBeenCalledTimes(2);
    expect(drawSpy.mock.calls[0]![2]).toBe(false);
    expect(drawSpy.mock.calls[1]![2]).toBe(true);
  });

  it('composes from the slab f64 vp and the pose off ctx.bodyPose, never view.vp', () => {
    const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
    mvpMock.mockClear();
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const { state, pass } = makeFixture({ draw: drawSpy }, true);
    const view = makeBodyView(asSceneBodyId('earth'));

    pass.draw(PASS_STUB, view, ctxAtAltitude(10), state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM by reference: proof the layer read ctx.bodyPose.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    // Third arg is the shell radius in METRES; the datum is already metres.
    expect(call[2]).toBe(EARTH.surface.datumRadiusM * CLOUD_SHELL_PARAMS.radiusRatio);
  });

  it('is a no-op for a body-m row that is not Earth’s own', () => {
    const drawSpy = vi.fn();
    const { state, pass } = makeFixture({ draw: drawSpy }, true);
    pass.draw(PASS_STUB, makeBodyView(asSceneBodyId('mars')), ctxAtAltitude(10), state);
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
