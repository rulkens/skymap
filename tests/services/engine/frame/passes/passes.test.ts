/**
 * passes — the per-pass `enabled` gates and the one registry-wide invariant
 * left on the row (blend against the target its `FRAME_ORDER` line names),
 * against stub state + ctx with no GPU device. The spot-checked `draw` calls
 * pin that a pass threads the resolved `SlabView`'s `vp`/`viewportPx` rather
 * than reading `ctx.vp`/`ctx.canvasSize` directly.
 *
 * Encoder sequencing and the post-process chain live in `renderFrame.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { Source } from '../../../../../src/data/sources';
import { packSelection } from '../../../../../src/data/selectionEncoding';
import { BiasMode } from '../../../../../src/data/galaxyCatalog/biasMode';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../../src/data/defaults';
import { CONTENT_PASSES } from '../../../../../src/services/engine/frame/passes';
import { galaxyPointSpritesPass } from '../../../../../src/services/engine/frame/passes/galaxyPointSpritesPass';
import { filamentsPass } from '../../../../../src/services/engine/frame/passes/filamentsPass';
import { milkyWayPass } from '../../../../../src/services/engine/frame/passes/milkyWayPass';
import { horizonShellPass } from '../../../../../src/services/engine/frame/passes/horizonShellPass';
import { starAggregatesPass } from '../../../../../src/services/engine/frame/passes/starAggregatesPass';
import { starAggregateUpsamplePass } from '../../../../../src/services/engine/frame/passes/starAggregateUpsamplePass';
import { sgrAStarLensingPass } from '../../../../../src/services/engine/frame/passes/sgrAStarLensingPass';
import { structureMarkersPass } from '../../../../../src/services/engine/frame/passes/structureMarkersPass';
import { COSMO, NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import { FRAME_ORDER } from '../../../../../src/services/engine/frame/frameOrder';
import { expandFrameOrder } from '../../../../../src/services/engine/frame/expandFrameOrder';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';
import type { SelectionRef } from '../../../../../src/@types/engine/SelectionRef';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

// ── Stub builders ───────────────────────────────────────────────────────────

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

/**
 * Build a ReadyFrameContext with stub GPU/subsystem handles. The tests
 * only inspect a subset (camera position, vp, canvas size, plus the
 * renderer mock for `draw`); the rest satisfy the type.
 *
 * `slabs` carries a real cosmological row (built from this ctx's own
 * `vp`/`drawCamPos`) so `slabViewOf(ctx, COSMO)` — the same resolution the
 * production encoders perform once per frame — works against these
 * fixtures without a bespoke double.
 */
function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  const galaxyPointRenderer = { draw: vi.fn() } as any;
  const renderTargets = { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any;
  const texturedDisks = {
    runFrame: vi.fn(),
    lastOutput: { quads: [], disks: [] },
    hasInFlightWork: () => false,
  } as any;
  const drawCamPos = [0, 0, 5] as Readonly<[number, number, number]>;
  const cosmoSlab: Slab = makeCosmoSlab({ vp: Float64Array.from(vp as unknown as Float32Array) });
  return {
    isReady: true,
    viewSlot: 0,
    renderedTargets: new Set<string>(),
    cam,
    vp,
    // Index 0 (NEAR0) duplicates the cosmological row: the milky-way draw
    // tests resolve slabViewOf(ctx, NEAR0) (the layer's slab), and reusing
    // the cosmo fixture there gives them a real vp without a bespoke
    // near-field double.
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    simDays: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    galaxyPointRenderer,
    renderTargets,
    texturedDisks,
    // Nothing in this file reads bodyPose — a stub that never resolves a
    // body is a safe default, overridable like every other field.
    bodyPose: () => null,
    ...overrides,
  };
}

// Knob-derived camera distances for the Milky-Way apparent-size fade band,
// under the stub ctx's camera (60° vertical fov, 720-px-tall viewport).
// Inverting apparentDiameterPx: the disc (diameter 2·R) spans exactly `px`
// on screen at distance 2·R·pxPerRad / px. Deriving the fixtures from the
// calibration knobs (rather than hardcoding Mpc values) keeps these tests
// green across visual-gate re-tunes of the band edges.
const MW_PX_PER_RAD = 720 / (2 * Math.tan((60 * Math.PI) / 180 / 2));
const MW_FULL_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_FULL_PX;
const MW_GONE_DIST_MPC = (2 * MILKY_WAY_RADIUS_MPC * MW_PX_PER_RAD) / MILKY_WAY_FADE_GONE_PX;

// The generated star/dust buffers the milky-way layer reads off
// `state.gpu.milkyWayCloud.buffers()`. A stable reference so `draw` tests can
// assert the exact snapshot was forwarded to the renderer.
const MW_CLOUD_BUFFERS = {
  starBuf: {} as GPUBuffer,
  starCount: 3,
  dustBuf: null,
  dustCount: 0,
};

// `state` is forwarded through — most layers ignore it, but
// `galaxyPointSpritesPass` reads `state.subsystems.fades.opacityOf` for
// per-source fade opacity. A minimal fades stub returning full opacity
// lets the layer run without a live FadeRegistry.
const STATE_STUB = {
  subsystems: {
    fades: {
      opacityOf: () => 1,
      isAnyAnimating: () => false,
    },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
  // The Milky-Way rows' `draw` now goes through the same
  // `deriveMilkyWayCloudAlpha` gate their `enabled` does (one liveness
  // projection shared by the aggregate producer, its upsample consumer, and
  // the dust pass), and that gate reads `settings.milkyWay.enabled` — so the
  // baseline stub has to carry it or `draw` throws before reaching the
  // renderer. Tests that need the toggle off override `settings` wholesale.
  settings: { milkyWay: { enabled: true } },
  // galaxyPointSpritesPass / disk layers bind the shared focus group off
  // state.gpu.focusUniform; an opaque bind group is all they read.
  // The nullable GPU renderer fields default to null (pre-bootstrap
  // shape); individual draw tests override the one they exercise.
  gpu: {
    focusUniform: { bindGroup: {} as GPUBindGroup, write: () => {}, destroy: () => {} },
    // milkyWayPass.draw reads the generated cloud buffers off this handle.
    milkyWayCloud: { buffers: () => MW_CLOUD_BUFFERS },
    milkyWayCloudRenderer: null,
    horizonShellRenderer: null,
    filamentRenderer: null,
    flowFieldRenderer: null,
    texturedDiskRenderer: null,
    proceduralDiskRenderer: null,
    volumeFieldRenderer: null,
  },
} as unknown as EngineState;

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('starAggregatesPass registry row', () => {
  it('shares ONE visibility gate with its upsample consumer', () => {
    // Producer and consumer are the same function by identity, so a frame can
    // never composite a stale offscreen the producer skipped clearing.
    expect(starAggregateUpsamplePass.enabled).toBe(starAggregatesPass.enabled);
  });
});

describe('CONTENT_PASSES blend legality', () => {
  it('every pass blends per the target its FRAME_ORDER line draws into', () => {
    // The registry half of the target<->blend invariant — the renderer half,
    // that the WebGPU pipeline's actual blend state matches, is covered
    // elsewhere. A pass whose target/blend pair falls outside this table is a
    // data-entry bug in its own file, not a new legal combination. The target
    // is the frame order's to state, so the expansion is what supplies it.
    const steps = expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: { exposure: 1, curve: 4, hdrKnee: 0, hdrHeadroom: 0 },
      bloomEnabled: true,
      foregroundChain: [NEAR0, 2],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [2],
    });
    const seen = new Set<string>();
    for (const step of steps) {
      if (step.kind !== 'render') continue;
      for (const pass of step.passes) {
        seen.add(pass.name);
        if (step.target === 'hdr') {
          // hdr admits two exceptions to its additive default: the Milky Way
          // dust pass extincts the emission already accumulated, and the Sgr A*
          // lens pass composites premultiplied-OVER so a captured ray truly
          // occludes the additive light behind it instead of adding to it
          // (Blend.d.ts's own doc names 'over' legal for any target, not just
          // the swap-chain rows). A third non-additive hdr row should fail this
          // test and be a deliberate decision.
          const expected =
            pass === milkyWayPass ? 'multiply' : pass === sgrAStarLensingPass ? 'over' : 'additive';
          expect(pass.blend).toBe(expected);
        } else if (step.target === 'foreground:0') {
          // The foreground group is opaque bodies EXCEPT three translucent
          // overlays — the ring, Earth's cloud shell, Earth's in-scatter
          // atmosphere — each drawn AFTER the opaque spheres, depth-tested
          // against them but writing no depth, straight-alpha OVER (spec §8 /
          // §8.3 / grill Q9). Their pipelines bake exactly that profile.
          const translucent = ['rings', 'cloud-shell', 'atmosphere-shell'].includes(pass.name);
          expect(pass.blend).toBe(translucent ? 'over' : 'opaque');
        } else if (step.target === 'swap') {
          expect(pass.blend).toBe('over');
        } else {
          // The four reduced-resolution offscreens (volume, zoa,
          // star-aggregates, mw-aggregate) accumulate the way their contents
          // would have accumulated straight into HDR — all additive sums, which
          // is what makes "render small, bilinearly upsample, add" equivalent to
          // drawing them full-res. A non-additive row breaks that equivalence.
          expect(pass.blend).toBe('additive');
        }
      }
    }
    // A pass no step drew would slip past the table above unexamined.
    expect(seen.size).toBe(CONTENT_PASSES.length);
  });
});

describe('galaxyPointSpritesPass.enabled', () => {
  it('always returns true (no user-facing toggle for point-sprites)', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(galaxyPointSpritesPass.enabled(STATE_STUB, ctx, view)).toBe(true);
    // Even when every other toggle is off, point-sprites still runs.
    expect(galaxyPointSpritesPass.enabled(STATE_STUB, ctx, view)).toBe(true);
  });
});

// Coverage for the `textured-disks` layer lives in
// `texturedDisksPass.test.ts` (one test file per ContentPass module,
// matching the convention used by every other entry in `passes/`). The
// hdr-target layers check above pins the name in canonical order.

describe('filamentsPass.enabled', () => {
  it('returns true when filaments.enabled is true (renderer presence checked in draw)', () => {
    const stateOn = {
      ...STATE_STUB,
      settings: { filaments: { enabled: true, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsPass.enabled(stateOn, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });

  it('returns false when filaments.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsPass.enabled(stateZeroFade, ctx, slabViewOf(ctx, COSMO))).toBe(false);
  });

  it('returns true when filaments.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // STATE_STUB's opacityOf = 1 simulates a fade-out in progress; the
    // gate keeps the layer alive so the user sees the smooth ~100 ms ramp
    // instead of an instant pop.
    const stateOffFading = {
      ...STATE_STUB,
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsPass.enabled(stateOffFading, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });
});

describe('filamentsPass.draw', () => {
  it('threads the SlabView vp/viewport to filamentRenderer.draw when present', () => {
    // This is the representative "draw threads the SlabView" check: the
    // layer must forward the SlabView's `vp`/`viewportPx` — NOT
    // `ctx.vp`/`ctx.canvasSize` directly.
    const drawSpy = vi.fn<(...args: unknown[]) => void>();
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    // intensity=0.7 now comes from state.settings.filaments.intensity.
    const stateWith07 = {
      ...STATE_STUB,
      settings: { filaments: { enabled: true, intensity: 0.7 } },
      gpu: { ...STATE_STUB.gpu, filamentRenderer: { draw: drawSpy } },
    } as unknown as EngineState;
    filamentsPass.draw(PASS_STUB, view, ctx, stateWith07);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toEqual(view.viewportPx);
    expect(args[3]).toBe(1.5); // line halfwidth (FILAMENT_LINE_HALFWIDTH_PX)
    expect(args[4]).toBe(0.7);
  });
});

describe('milkyWayPass.enabled', () => {
  it('returns true when milkyWay.enabled is true and the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX, safely full-alpha. Both gates pass.
    const stateOn = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });

  it('returns false when milkyWay.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateOffZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(milkyWayPass.enabled(stateOffZeroFade, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });

  it('returns true when milkyWay.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // opacityOf = 1 simulates a toggle fade-out still in flight, and the
    // apparent-size fadeAlpha also passes (camera well inside the FULL
    // distance), so the gate's second condition is non-zero — the layer
    // renders.
    const stateOffFading = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOffFading, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });

  it('returns false once the disc shrinks past the GONE apparent size (no empty render pass)', () => {
    // Twice the GONE-threshold distance → apparent diameter is half
    // MILKY_WAY_FADE_GONE_PX, safely past the band → alpha 0. Gating in
    // `enabled` (not just `draw`) skips the empty beginRenderPass +
    // timestamp-write on the split-encoder path.
    const stateOn = {
      ...STATE_STUB,
      settings: { milkyWay: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx({
      drawCamPos: [MW_GONE_DIST_MPC * 2, 0, 0] as Readonly<[number, number, number]>,
    });
    expect(milkyWayPass.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });
});

describe('milkyWayPass.draw', () => {
  it('calls state.gpu.milkyWayCloudRenderer.drawDust with the packed args when the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX — fadeAlpha should be 1.0.
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    // NEAR0 — the layer's slab since the fixed COSMO near plane clipped the
    // disc mid-descent (the fixture duplicates the cosmo row at index 0, so
    // the resolved view carries the same vp).
    const view = slabViewOf(ctx, NEAR0);
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, milkyWayCloudRenderer: { drawDust: drawSpy } },
    } as unknown as EngineState;
    milkyWayPass.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // This row draws ONLY the dust pass now — the additive star pass moved to
    // milkyWayAggregatePass, which renders it into the reduced-resolution
    // `mw-aggregate` offscreen. Signature: drawDust(pass, MilkyWayCloudDrawArgs).
    const [passArg, args] = drawSpy.mock.calls[0]!;
    expect(passArg).toBe(PASS_STUB);
    expect(args.vp).toBe(view.vp);
    expect(args.viewportPx).toEqual(view.viewportPx);
    // fadeAlpha above the FULL threshold is 1.0 (full strength).
    expect(args.fadeAlpha).toBe(1.0);
    // The generated buffer snapshot is forwarded verbatim.
    expect(args.buffers).toBe(MW_CLOUD_BUFFERS);
    // Billboard basis (from cameraBillboardBasis(ctx.cam)) + the fixed model
    // matrix are packed as plain vectors / a 16-float column-major matrix.
    expect(args.camRight).toHaveLength(3);
    expect(args.camUp).toHaveLength(3);
    expect(args.model).toHaveLength(16);
  });

  it('is a no-op when state.gpu.milkyWayCloudRenderer is null (pre-bootstrap)', () => {
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    expect(() =>
      milkyWayPass.draw(PASS_STUB, slabViewOf(ctx, NEAR0), ctx, STATE_STUB),
    ).not.toThrow();
  });
});

describe('horizonShellPass.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the layer is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    const ctx0 = makeCtx();
    expect(horizonShellPass.enabled(STATE_STUB, ctx0, slabViewOf(ctx0, COSMO))).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(horizonShellPass.enabled(STATE_STUB, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });
});

describe('horizonShellPass.draw', () => {
  it('forwards the distance-fade alpha as the 4th draw arg', () => {
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, horizonShellRenderer: { draw: drawSpy } },
    } as unknown as EngineState;
    horizonShellPass.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    expect(args[2]).toEqual(view.viewportPx);
    // 8 Gpc is past the full-strength point → alpha 1.0.
    expect(args[3]).toBe(1.0);
  });

  it('is a no-op when state.gpu.horizonShellRenderer is null (pre-bootstrap)', () => {
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(() =>
      horizonShellPass.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, STATE_STUB),
    ).not.toThrow();
  });
});

// Minimal settings shape for the galaxyPointSpritesPass.draw tests — only
// the fields the layer now reads from `state.settings`.
const POINT_SPRITES_SETTINGS_STUB = {
  galaxyCatalogs: {
    sizePx: 2.5,
    brightness: 1.0,
    provenance: DEFAULT_GALAXY_PROVENANCE,
    depthFade: true,
  },
  bias: {
    mode: BiasMode.None,
    absMagLimit: -19,
  },
} as unknown as EngineState['settings'];

describe('galaxyPointSpritesPass.draw', () => {
  it('packs (source, index) into the selectedPacked u32', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    // Selection is sourced from state.selection.select, not makeSettings.
    const stateWithSelection = {
      ...STATE_STUB,
      selection: {
        select: {
          type: 'galaxyCatalog',
          source: Source.SDSS,
          index: 42,
        } as SelectionRef,
        hover: null,
        focus: null,
      },
      settings: POINT_SPRITES_SETTINGS_STUB,
    } as unknown as EngineState;
    galaxyPointSpritesPass.draw(PASS_STUB, view, ctx, stateWithSelection);
    const drawSpy = ctx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Selection lives on arg[3].selectedPacked (the GalaxyPointDrawSettings
    // record).
    const expected = packSelection(Source.SDSS, 42);
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(expected);
  });

  it('translates null selection to the 0xFFFFFFFF sentinel', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    // Null selection via state.selection.select; settings shape satisfies
    // the layer's direct reads from state.settings.
    const stateNullSelection = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
    } as unknown as EngineState;
    galaxyPointSpritesPass.draw(PASS_STUB, view, ctx, stateNullSelection);
    const drawSpy = ctx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>;
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
  });

  it('multiplies the deep-zoom survey fade into fadeOpacityOf', () => {
    // The whole point cloud recedes on descent into the solar system: the
    // per-source registry opacity (stubbed to 1) is multiplied by the
    // surveyDeepZoom band, keyed on the camera's distance from the
    // heliocentric origin. The default fixture camera sits 5 Mpc out — far
    // outside the band — so the callback must return the registry value
    // unchanged; a camera mid-band must scale it to a strict fraction.
    const state = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
    } as unknown as EngineState;

    const farCtx = makeCtx();
    galaxyPointSpritesPass.draw(PASS_STUB, slabViewOf(farCtx, COSMO), farCtx, state);
    const farSettings = (farCtx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>).mock
      .calls[0]![3] as Record<string, unknown>;
    const farFadeOf = farSettings.fadeOpacityOf as (source: number) => number;
    expect(farFadeOf(Source.SDSS)).toBe(1);

    // Mid-band: 0.005 Mpc from origin sits strictly between the band's goneAt
    // (0.002) and fullAt (FOREGROUND_MAX_DISTANCE_MPC ≈ 0.0103), so the fade
    // factor must be a strict fraction — proving the multiply, not just the
    // fully-faded skip below.
    const midCtx = makeCtx({
      drawCamPos: [0, 0, 0.005] as Readonly<[number, number, number]>,
    });
    galaxyPointSpritesPass.draw(PASS_STUB, slabViewOf(midCtx, COSMO), midCtx, state);
    const midSettings = (midCtx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>).mock
      .calls[0]![3] as Record<string, unknown>;
    const midFadeOf = midSettings.fadeOpacityOf as (source: number) => number;
    const midFade = midFadeOf(Source.SDSS);
    expect(midFade).toBeGreaterThan(0);
    expect(midFade).toBeLessThan(1);
  });

  it('exempts the famous catalog from the survey fade at deep zoom', () => {
    // Inside the band's goneAt edge the survey sources resolve to 0 (the
    // renderer's per-source loop then skips them), but the famous catalog
    // keeps its raw registry opacity — its curated galaxies stay visible
    // inside the Milky Way and near Earth as reference points. The layer
    // still calls renderer.draw: famous may be loaded.
    const state = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
    } as unknown as EngineState;

    const deepCtx = makeCtx({
      drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]>,
    });
    galaxyPointSpritesPass.draw(PASS_STUB, slabViewOf(deepCtx, COSMO), deepCtx, state);
    const deepSettings = (deepCtx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>).mock
      .calls[0]![3] as Record<string, unknown>;
    const deepFadeOf = deepSettings.fadeOpacityOf as (source: number) => number;
    expect(deepFadeOf(Source.SDSS)).toBe(0);
    // Registry stub returns 1 — famous must pass it through untouched.
    expect(deepFadeOf(Source.FamousGalaxy)).toBe(1);
  });

  it('threads view.vp / view.viewportPx / view.camPos to renderer.draw', () => {
    // The SlabView-threading check for the point-sprites layer specifically:
    // it must forward the resolved SlabView, not ctx.vp/ctx.canvasSize.
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    const stateNullSelection = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
    } as unknown as EngineState;
    galaxyPointSpritesPass.draw(PASS_STUB, view, ctx, stateNullSelection);
    const drawSpy = ctx.galaxyPointRenderer.draw as ReturnType<typeof vi.fn>;
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    const drawSettings = call[3] as Record<string, unknown>;
    expect(drawSettings.camPosWorld).toEqual(view.camPos);
  });
});

describe('drawPick migration-table rows', () => {
  it('exactly the fourteen pickables expose drawPick, in registry order', () => {
    // Pins the spec's migration table: the six COSMO/near-field survey
    // pickables (pointSprites / zoneOfAvoidance / proceduralDisks /
    // structureMarkers / milkyWay / starCatalog) PLUS the six NEAR0 true-scale
    // foreground bodies (starPoints / bodyGlints / earth / starSpheres /
    // focusedFieldStarSphere / planets), the selection-gated
    // focused-field-star sphere's pick and the sub-pixel body glints' pick
    // among them — plus the two label rows, whose text is a click target for
    // the subject it names. Order is registry order: the COSMO pick pass leads with
    // point-sprites (the @group(0) prefix contract); zone-of-avoidance sits
    // right after it in the registry for exactly that reason — the pick
    // program groups by slab alone (a pass's visual target is FRAME_ORDER's
    // business, not the pick pass's) and needs
    // this row after the one that establishes the shared camera. Every NEAR0
    // body self-binds its own slot-0 camera in its own pass, so their
    // relative order carries no @group(0) dependence (it is depth-resolved,
    // nearest-wins). The pick program filters by `drawPick` presence + the
    // pick gate, never a hardcoded name list — so this test is the ONLY place
    // the fourteen names are asserted.
    expect(CONTENT_PASSES.filter((layer) => layer.drawPick).map((layer) => layer.name)).toEqual([
      'point-sprites',
      'zone-of-avoidance',
      'procedural-disks',
      'structure-markers',
      'milky-way',
      'star-points',
      'star-catalog',
      'body-glints',
      'labels',
      'earth',
      'star-spheres',
      'field-star-sphere',
      'planets',
      'foreground-labels',
    ]);
  });
});

describe('structureMarkersPass.enabled', () => {
  it('disables once the surveyDeepZoom fade completes (opacity-zero principle)', () => {
    // Every marker fragment resolves to alpha 0 past the goneAt edge, so the
    // layer must leave the pass plan entirely — the executor drops the
    // render step, and the pick program (which runs this same gate) stops
    // the rings claiming hits.
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, structureMarkerRenderer: { markerCount: () => 3 } },
    } as unknown as EngineState;
    // Default fixture camera: 5 Mpc from origin, far outside the band.
    const farCtx = makeCtx();
    expect(structureMarkersPass.enabled(state, farCtx, slabViewOf(farCtx, COSMO))).toBe(true);
    // Inside goneAt (0.002 Mpc) → disabled despite queued markers.
    const nearCtx = makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> });
    expect(structureMarkersPass.enabled(state, nearCtx, slabViewOf(nearCtx, COSMO))).toBe(false);
  });
});

describe('galaxyPointSpritesPass.drawPick', () => {
  it('filters loadedSources by ctx.visibleSourceMask before drawPoints', () => {
    // The pick ctx's `visibleSourceMask` IS the pick mask, so a catalog whose
    // bit is clear (toggled off / fading out) is dropped before the picker
    // draws it.
    const drawPointsSpy = vi.fn<(...args: unknown[]) => void>();
    // renderer.loadedSources yields SDSS + 2MRS + GLADE; only SDSS + GLADE
    // bits are set in the mask.
    const loaded = [Source.SDSS, Source.TwoMRS, Source.Glade].map((source) => ({
      source,
      vertexBuffer: {} as GPUBuffer,
      count: 1,
      sourceBuffer: {} as GPUBuffer,
    }));
    const ctx = makeCtx({
      galaxyPointRenderer: { draw: vi.fn(), loadedSources: () => loaded } as any,
      visibleSourceMask: (1 << Source.SDSS) | (1 << Source.Glade),
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
      gpu: { ...STATE_STUB.gpu, galaxyPickRenderer: { drawPoints: drawPointsSpy } },
    } as unknown as EngineState;

    galaxyPointSpritesPass.drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    // arg[1] is the filtered `sources` list handed to drawPoints.
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.SDSS, Source.Glade]);
  });

  it('drops band-faded survey sources from the pick, famous exempt, but still calls drawPoints', () => {
    // Invisible → unpickable: inside the surveyDeepZoom goneAt edge a survey
    // source's band-multiplied opacity is exactly 0, so it must stop claiming
    // hits. Famous rides its exemption (still pickable). drawPoints is called
    // regardless — its @group(0) pick-camera bind is the prefix contract the
    // ring / disk / Milky-Way pick pipelines depend on.
    const drawPointsSpy = vi.fn<(...args: unknown[]) => void>();
    const loaded = [Source.SDSS, Source.FamousGalaxy].map((source) => ({
      source,
      vertexBuffer: {} as GPUBuffer,
      count: 1,
      sourceBuffer: {} as GPUBuffer,
    }));
    const ctx = makeCtx({
      galaxyPointRenderer: { draw: vi.fn(), loadedSources: () => loaded } as any,
      visibleSourceMask: 0xffffffff,
      drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
      gpu: { ...STATE_STUB.gpu, galaxyPickRenderer: { drawPoints: drawPointsSpy } },
    } as unknown as EngineState;

    galaxyPointSpritesPass.drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.FamousGalaxy]);
  });
});
