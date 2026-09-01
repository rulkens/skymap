/**
 * cloudShellLayer — unit tests for Earth's translucent cloud-shell `'body'`-
 * slab content row.
 *
 * Two things this suite pins beyond the descent fade (its original scope):
 * the layer now reads its pose off `ctx.bodyPose(bodyId)` and composes
 * against the slab's f64 `view.slab.vp` via `composeBodySlabMvp` (the seam
 * every body-slab layer shares — see `earthLayer.test.ts`), and it must
 * leave the pass plan for a body-m row that ISN'T Earth's (`cloudShellDraw`'s
 * widened gate — CLOUD_SHELL_PARAMS has no per-body table, so today that
 * means every non-Earth row).
 *
 * The load-bearing descent-fade assertion carries over unchanged: `enabled`
 * goes false once the camera is close enough to the surface for the fade to
 * reach 0 — even with the clouds slot resident and Earth comfortably above
 * the sub-pixel threshold — because a fully-faded shell must leave the pass
 * plan rather than draw a fully transparent sphere (the house "opacity 0 ⇒
 * no render" rule). `draw` is pinned separately to confirm the fade actually
 * reaches the packed opacity, not just the gate.
 *
 * Task 10 adds a third assertion: `insideShell` (camera below
 * `CLOUD_SHELL_PARAMS.radiusRatio`) must reach `renderer.draw`'s third
 * argument unchanged, so the renderer picks its front-cull pipeline exactly
 * when the back-cull one would discard everything.
 */

import { describe, it, expect, vi } from 'vitest';

import { cloudShellLayer } from '../../../../../src/services/engine/frame/passes/cloudShellLayer';
import { CLOUD_SHELL_PARAMS } from '../../../../../src/data/bodies/cloudShellParams';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../../src/services/engine/frame/foregroundMaxDistance';
import { bodyTextureSlotKey } from '../../../../../src/utils/scene/bodyTextureSlotKey';
import { makeSlab } from '../../../../fixtures/makeSlab';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { BodyRelativePose } from '../../../../../src/@types/engine/camera/BodyRelativePose';

// Mock composeBodySlabMvp so draw() never touches the real f64 composition —
// covered by that util's own tests. Real composeBodySlabMvp returns f64; the
// layer narrows its own copy at the GPU-upload boundary.
vi.mock('../../../../../src/utils/camera/composeBodySlabMvp', () => ({
  composeBodySlabMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));
import { composeBodySlabMvp } from '../../../../../src/utils/camera/composeBodySlabMvp';

// Stub the per-frame body-state snapshot to the seeded fixture's own
// positionMpc/orientation refs, mirroring earthLayer.test.ts.
type SeededEarth = EarthBody & Pick<BodyState, 'positionMpc' | 'orientation'>;

vi.mock('../../../../../src/services/engine/frame/sceneBodyStates', () => ({
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

const IDENTITY_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as BodyState['orientation'];

// Positioned at the render origin (not, say, 1 Mpc out): Earth's radius in Mpc
// is ~2e-16, the same order as f64 epsilon at magnitude 1 — subtracting a
// radius-scale camera offset from a 1 Mpc position would lose the offset
// entirely to roundoff. At the origin, `0 - distanceMpc` is exact for any
// distanceMpc, so the altitude fixtures below are precision-clean.
const EARTH: SeededEarth = {
  id: 'earth',
  label: 'Earth',
  radiusM: 6371000,
  positionMpc: [0, 0, 0],
  orientation: IDENTITY_MAT3,
};

// `composeBodySlabMvp` is mocked, so the pose's actual geometry never
// matters — only that `ctx.bodyPose` returns a non-null value for the layer
// to forward.
const STUB_POSE: BodyRelativePose = { eyeRelBodyM: [1, 2, 3], basisM: IDENTITY_MAT3 };

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makeBodyView(bodyId: BodyId): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp, frame: { kind: 'body-m', bodyId } });
  return { slab, vp: f32Vp, camPos: [0, 0, 5], viewportPx: [1280, 720] };
}

/**
 * Camera `altitudeRadii` above Earth's surface, straight down -x, well inside
 * the shared foreground gate and comfortably resolved (not sub-pixel) — so
 * every test here isolates the descent-fade gate from the OTHER gates.
 */
function ctxAtAltitude(altitudeRadii: number): ReadyFrameContext {
  const radiusMpc = EARTH.radiusM * SCALE_UNITS.M_TO_MPC;
  const distanceMpc = radiusMpc * (1 + altitudeRadii);
  return {
    cam: { distance: FOREGROUND_MAX_DISTANCE_MPC / 2 },
    drawCamPos: [EARTH.positionMpc[0] - distanceMpc, EARTH.positionMpc[1], EARTH.positionMpc[2]],
    bodyPose: (() => STUB_POSE) as ReadyFrameContext['bodyPose'],
    canvasSize: { width: 1280, height: 720 },
    fovYRad: (60 * Math.PI) / 180,
  } as unknown as ReadyFrameContext;
}

/** State with a `cloudShellRenderer` handle, the seeded Earth, and clouds residency. */
function makeState(renderer: unknown, resident: boolean): EngineState {
  const bodyTextures = new Map(
    resident
      ? [[bodyTextureSlotKey('earth', 'clouds'), { current: () => ({}) as ImageBitmap }] as const]
      : [],
  );
  return {
    gpu: { cloudShellRenderer: renderer },
    data: { bodies: { earth: EARTH } },
    assetSlots: { bodyTextures },
    settings: { earth: { ambientLight: 0.08 } },
  } as unknown as EngineState;
}

describe('cloudShellLayer.enabled', () => {
  it('is false while the clouds slot is not resident, even well above the fade band', () => {
    const state = makeState({ draw: vi.fn() }, false);
    expect(cloudShellLayer.enabled(state, ctxAtAltitude(10), makeBodyView('earth' as BodyId))).toBe(
      false,
    );
  });

  it('is true when resident and well above the fade band', () => {
    const state = makeState({ draw: vi.fn() }, true);
    expect(cloudShellLayer.enabled(state, ctxAtAltitude(10), makeBodyView('earth' as BodyId))).toBe(
      true,
    );
  });

  it('is false once the camera descends below the fade-out altitude — resident and well above sub-pixel notwithstanding', () => {
    // The property a future refactor could silently break: the deck must
    // leave the pass plan once fully faded (house "opacity 0 ⇒ no render"
    // rule), not draw at opacity 0. The OTHER two gates both pass at this
    // altitude — the clouds slot is resident and Earth is nowhere near
    // sub-pixel — so only a regression in the fade gate itself would flip
    // this back to true. Half the fade-end altitude, not the edge itself, to
    // stay clear of the roundoff a distance→altitude round trip introduces
    // right at the boundary (see cloudDeckFade's own tests).
    const state = makeState({ draw: vi.fn() }, true);
    const belowFadeFloor = ctxAtAltitude(CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii / 2);
    expect(cloudShellLayer.enabled(state, belowFadeFloor, makeBodyView('earth' as BodyId))).toBe(
      false,
    );
  });

  it('is false for a body-m row that is not Earth’s own, even resident and well above the fade band', () => {
    // CLOUD_SHELL_PARAMS carries no per-body table — the deliberate lean
    // choice (atmosphereShellLayer's header) — so every non-Earth row must
    // leave the pass plan regardless of how favourable its OTHER gates are.
    const state = makeState({ draw: vi.fn() }, true);
    expect(cloudShellLayer.enabled(state, ctxAtAltitude(10), makeBodyView('mars' as BodyId))).toBe(
      false,
    );
  });
});

describe('cloudShellLayer.draw', () => {
  it('scales the packed opacity by the descent fade partway through the band', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const state = makeState({ draw: drawSpy }, true);
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const ctx = ctxAtAltitude(midAltitudeRadii);
    const view = makeBodyView('earth' as BodyId);

    cloudShellLayer.draw(PASS_STUB, view, ctx, state);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [, uniforms] = drawSpy.mock.calls[0]!;
    // Float index 19 (byte 76) is cloudOpacity — see packCloudShellUniforms's
    // byte layout. Strictly below the authored dial and strictly above 0: the
    // camera sits mid-band, not past the fade-out floor.
    expect(uniforms[19]).toBeGreaterThan(0);
    expect(uniforms[19]).toBeLessThan(CLOUD_SHELL_PARAMS.opacity);
  });

  it('passes insideShell as the third draw() argument — false above the shell radius, true below it', () => {
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const state = makeState({ draw: drawSpy }, true);
    const view = makeBodyView('earth' as BodyId);

    // Well above CLOUD_SHELL_PARAMS.radiusRatio (1.002) — the outside pipeline.
    cloudShellLayer.draw(PASS_STUB, view, ctxAtAltitude(10), state);
    // Below radiusRatio − 1 (0.002) but still above the re-tuned fade floor
    // (0.0005) — the deck is still visible AND the camera is inside the shell,
    // exactly the case Task 10's cull fix exists for.
    cloudShellLayer.draw(PASS_STUB, view, ctxAtAltitude(0.001), state);

    expect(drawSpy).toHaveBeenCalledTimes(2);
    expect(drawSpy.mock.calls[0]![2]).toBe(false);
    expect(drawSpy.mock.calls[1]![2]).toBe(true);
  });

  it('composes from the slab f64 vp and the pose off ctx.bodyPose, never view.vp', () => {
    const mvpMock = composeBodySlabMvp as unknown as ReturnType<typeof vi.fn>;
    mvpMock.mockClear();
    const drawSpy =
      vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean) => void>();
    const state = makeState({ draw: drawSpy }, true);
    const view = makeBodyView('earth' as BodyId);

    cloudShellLayer.draw(PASS_STUB, view, ctxAtAltitude(10), state);

    expect(mvpMock).toHaveBeenCalledTimes(1);
    const call = mvpMock.mock.calls[0]!;
    expect(call[0]).toBe(view.slab.vp);
    expect(call[0]).not.toBe(view.vp);
    // Second arg is the pose's eyeRelBodyM, forwarded by reference — proof the
    // layer read ctx.bodyPose rather than re-deriving a pose of its own.
    expect(call[1]).toBe(STUB_POSE.eyeRelBodyM);
    // Third arg is the shell radius in METRES — earth.radiusM is already
    // metres, so no Mpc conversion crosses this seam (the removed M_TO_MPC).
    expect(call[2]).toBe(EARTH.radiusM * CLOUD_SHELL_PARAMS.radiusRatio);
  });

  it('is a no-op for a body-m row that is not Earth’s own', () => {
    const drawSpy = vi.fn();
    const state = makeState({ draw: drawSpy }, true);
    cloudShellLayer.draw(PASS_STUB, makeBodyView('mars' as BodyId), ctxAtAltitude(10), state);
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
