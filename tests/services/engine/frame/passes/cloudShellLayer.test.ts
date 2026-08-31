/**
 * cloudShellLayer — unit tests for Earth's translucent cloud-shell content row.
 *
 * Scoped to the descent fade this task introduces: the load-bearing new
 * assertion is that `enabled` goes false once the camera is close enough to
 * the surface for the fade to reach 0 — even with the clouds slot resident
 * and Earth comfortably above the sub-pixel threshold — because a
 * fully-faded shell must leave the pass plan rather than draw a fully
 * transparent sphere (the house "opacity 0 ⇒ no render" rule). `draw` is
 * pinned separately to confirm the fade actually reaches the packed opacity,
 * not just the gate.
 *
 * Reuses the fixture shape `earthLayer.test.ts` established for this same
 * seeded body (`composeBodyMvp` mocked for identity, `sceneBodyStates`
 * stubbed to a map keyed off the seeded record).
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
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { EarthBody } from '../../../../../src/@types/scene/EarthBody';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';

// Mock composeBodyMvp so draw() never touches the real f64 composition —
// covered by that util's own tests. Real composeBodyMvp returns f64; the
// layer narrows its own copy at the GPU-upload boundary.
vi.mock('../../../../../src/utils/camera/composeBodyMvp', () => ({
  composeBodyMvp: vi.fn<() => Float64Array>(() => new Float64Array(16)),
}));

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

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  drawIndexed: vi.fn(),
} as unknown as GPURenderPassEncoder;

function makeNear0View(): SlabView {
  const f64Vp = Float64Array.from({ length: 16 }, (_, i) => i + 0.5);
  const f32Vp = new Float32Array(16);
  const slab: Slab = makeSlab({ vp: f64Vp });
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
    expect(cloudShellLayer.enabled(state, ctxAtAltitude(10), makeNear0View())).toBe(false);
  });

  it('is true when resident and well above the fade band', () => {
    const state = makeState({ draw: vi.fn() }, true);
    expect(cloudShellLayer.enabled(state, ctxAtAltitude(10), makeNear0View())).toBe(true);
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
    expect(cloudShellLayer.enabled(state, belowFadeFloor, makeNear0View())).toBe(false);
  });
});

describe('cloudShellLayer.draw', () => {
  it('scales the packed opacity by the descent fade partway through the band', () => {
    const drawSpy = vi.fn<(pass: GPURenderPassEncoder, uniforms: Float32Array) => void>();
    const state = makeState({ draw: drawSpy }, true);
    const midAltitudeRadii =
      (CLOUD_SHELL_PARAMS.fadeStartAltitudeRadii + CLOUD_SHELL_PARAMS.fadeEndAltitudeRadii) / 2;
    const ctx = ctxAtAltitude(midAltitudeRadii);
    const view = makeNear0View();

    cloudShellLayer.draw(PASS_STUB, view, ctx, state);

    expect(drawSpy).toHaveBeenCalledTimes(1);
    const [, uniforms] = drawSpy.mock.calls[0]!;
    // Float index 19 (byte 76) is cloudOpacity — see packCloudShellUniforms's
    // byte layout. Strictly below the authored dial and strictly above 0: the
    // camera sits mid-band, not past the fade-out floor.
    expect(uniforms[19]).toBeGreaterThan(0);
    expect(uniforms[19]).toBeLessThan(CLOUD_SHELL_PARAMS.opacity);
  });
});
