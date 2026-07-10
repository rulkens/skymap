/**
 * passes — unit tests for the per-layer `enabled` gates and the
 * `CONTENT_LAYERS` migration-table shape.
 *
 * Test surface:
 *   - Each layer's `enabled(state, ctx)` predicate flips correctly for
 *     its gate, with stub state + ctx (no GPU device).
 *   - `CONTENT_LAYERS` holds every hdr-group layer with the migration
 *     table's `{slab, target, blend}` fields.
 *   - A few `draw` calls verified end-to-end with stub renderers,
 *     confirming which renderer method fires and with which args,
 *     including that `draw` threads the resolved `SlabView`'s
 *     `vp`/`viewportPx` rather than reading `ctx.vp`/`ctx.canvasSize`
 *     directly.
 *
 * Encoder command sequencing and the post-process tone-map running
 * outside the HDR pass are covered by `renderFrame.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { Source } from '../../../../../src/data/sources';
import { BiasMode } from '../../../../../src/data/galaxyCatalog/biasMode';
import {
  CONTENT_LAYERS,
  scalarVolumeLayer,
  pointSpritesLayer,
  filamentsLayer,
  milkyWayLayer,
  horizonShellLayer,
  starPointsLayer,
  orbitRingsLayer,
  foregroundLabelsLayer,
} from '../../../../../src/services/engine/frame/passes';
import { COSMO, NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';
import type { SelectionRef } from '../../../../../src/@types/engine/SelectionRef';
import type { Slab } from '../../../../../src/@types/engine/frame/Slab';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../../src/services/gpu/galaxy/milkyWayCalibration';

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
  const renderer = { draw: vi.fn() } as any;
  const renderTargets = { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any;
  const texturedDisks = {
    runFrame: vi.fn(),
    lastOutput: { quads: [], disks: [] },
    hasInFlightWork: () => false,
  } as any;
  const drawCamPos = [0, 0, 5] as Readonly<[number, number, number]>;
  const cosmoSlab: Slab = {
    index: COSMO,
    nearMpc: 0.01,
    farMpc: 50000,
    vp: Float64Array.from(vp as unknown as Float32Array),
    originRelative: false,
    precision: 'f32',
  };
  return {
    isReady: true,
    cam,
    vp,
    // Index 0 (NEAR0) is unused by every test below; duplicating the
    // cosmological row there keeps the array non-empty without a
    // near-field fixture no test reads.
    slabs: [cosmoSlab, cosmoSlab],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderer,
    renderTargets,
    texturedDisks,
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
// `pointSpritesLayer` reads `state.subsystems.fades.opacityOf` for
// per-source fade opacity. A minimal fades stub returning full opacity
// lets the layer run without a live FadeRegistry.
const STATE_STUB = {
  subsystems: {
    fades: {
      opacityOf: () => 1,
      isAnyAnimating: () => false,
    },
  },
  // pointSpritesLayer / disk layers bind the shared focus group off
  // state.gpu.focusUniform; an opaque bind group is all they read.
  // The nullable GPU renderer fields default to null (pre-bootstrap
  // shape); individual draw tests override the one they exercise.
  gpu: {
    focusUniform: { bindGroup: {} as GPUBindGroup, write: () => {}, destroy: () => {} },
    // milkyWayLayer.draw reads the generated cloud buffers off this handle.
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

// The canonical hdr-group name order, pinned once and reused by every
// registry-shape assertion below.
const HDR_NAMES = [
  'point-sprites',
  'procedural-disks',
  'textured-disks',
  'milky-way',
  'filaments',
  'flow',
  'volume-upsample',
  'horizon-shell',
  'structure-markers',
];

// The canonical swap-group (post-tone-map, premultiplied-OVER) name order —
// see the renderer-unification design's migration table (spec lines
// 208-212). Selection ring leads so marker-lines and labels composite over
// its stroke; the debug clip-path overlay trails everything else.
const SWAP_NAMES = [
  'selection-ring',
  'disk-radius-ring',
  'marker-lines',
  'labels',
  'clip-path-debug',
];

// The near-field foreground group: the true-scale bodies (Earth, the Sun
// sphere, the planets) drawn into the depth-bearing `foreground:0` target
// through the near0 slab. Opaque (depth-tested), unlike the additive HDR
// group and the OVER swap group.
const FOREGROUND_NAMES = ['earth', 'star-spheres', 'planets'];

// The near-field hdr rows: the layers that pair the hdr target with the
// near0 slab — additive like every hdr row, but projected through NEAR0 so
// parsec-to-AU-scale anchors clear the near plane. One (hdr, NEAR0) render
// group, driven by the program's dedicated step before the tone-map: the
// far-partition star points, then the debug orbit rings.
const NEAR_HDR_NAMES = ['star-points', 'orbit-rings'];

// The near-field captions group: the scene-body name labels. Like the COSMO
// swap overlays they target the swap chain with premultiplied-OVER, but they
// project through the near0 slab so the caption anchors track the true-scale
// bodies rather than being clipped by the cosmological near plane. Its own
// (swap, NEAR0) render group, distinct from the (swap, COSMO) overlays above.
const NEAR_LABEL_NAMES = ['foreground-labels'];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CONTENT_LAYERS migration table (hdr group)', () => {
  it('every hdr content layer matches the migration table', () => {
    // Every current layer projects through the cosmological slab into the
    // HDR target with additive blending — see the renderer-unification
    // design's migration table (spec lines 196-213). Pinning `{slab,
    // target, blend}` here means a future layer with a different profile
    // (e.g. the near-field debug bodies) fails loudly instead of silently
    // drawing through the wrong slab/target.
    const hdrLayers = CONTENT_LAYERS.filter((layer) => HDR_NAMES.includes(layer.name));
    expect(hdrLayers.map((layer) => layer.name)).toEqual(HDR_NAMES);
    for (const layer of hdrLayers) {
      expect(layer.slab).toBe(COSMO);
      expect(layer.target).toBe('hdr');
      expect(layer.blend).toBe('additive');
    }
  });
});

describe('CONTENT_LAYERS migration table (near-field hdr group)', () => {
  it('the (hdr, NEAR0) group holds star-points then orbit-rings, additive', () => {
    // The hdr rows outside the cosmological slab: the far-partition
    // neighbourhood stars and the debug orbit rings, projected through NEAR0
    // (COSMO's 0.01 Mpc near plane would clip their parsec-to-AU-scale
    // anchors) but accumulating into the same HDR target so they ride the
    // galaxies' tone-map. Drawn by the program's dedicated (hdr, NEAR0) step
    // before the hdr→swap composite.
    const nearHdr = CONTENT_LAYERS.filter(
      (layer) => layer.target === 'hdr' && layer.slab === NEAR0,
    );
    expect(nearHdr.map((layer) => layer.name)).toEqual(NEAR_HDR_NAMES);
    expect(nearHdr).toContain(starPointsLayer);
    expect(nearHdr).toContain(orbitRingsLayer);
    for (const layer of nearHdr) {
      expect(layer.slab).toBe(NEAR0);
      expect(layer.target).toBe('hdr');
      expect(layer.blend).toBe('additive');
    }
  });
});

describe('CONTENT_LAYERS migration table (swap group)', () => {
  it('every swap content layer matches the migration table', () => {
    // The five post-tone-map UI overlays project through the same
    // cosmological slab as the HDR group but target the swap chain with
    // premultiplied-OVER blending — see the renderer-unification design's
    // migration table (spec lines 208-212).
    const swapLayers = CONTENT_LAYERS.filter((layer) => SWAP_NAMES.includes(layer.name));
    expect(swapLayers.map((layer) => layer.name)).toEqual(SWAP_NAMES);
    for (const layer of swapLayers) {
      expect(layer.slab).toBe(COSMO);
      expect(layer.target).toBe('swap');
      expect(layer.blend).toBe('over');
    }
  });
});

describe('CONTENT_LAYERS migration table (foreground group)', () => {
  it('every foreground content layer draws into foreground:0 through the near0 slab, opaque', () => {
    // The near-field bodies (Earth, the Sun sphere, the planets) leave the
    // cosmological slab: they project through NEAR0 into the depth-bearing
    // `foreground:0` target and are opaque (depth-tested), not additive. See
    // the renderer-unification design's migration table (spec line 215).
    const fgLayers = CONTENT_LAYERS.filter((layer) => FOREGROUND_NAMES.includes(layer.name));
    expect(fgLayers.map((layer) => layer.name)).toEqual(FOREGROUND_NAMES);
    for (const layer of fgLayers) {
      expect(layer.slab).toBe(NEAR0);
      expect(layer.target).toBe('foreground:0');
      expect(layer.blend).toBe('opaque');
    }
  });
});

describe('CONTENT_LAYERS migration table (near-field labels group)', () => {
  it('the scene-body captions draw into swap through the near0 slab, over', () => {
    // The near-field captions are the second foreground group: like the COSMO
    // swap overlays they target the swap chain with premultiplied-OVER, but
    // they project through NEAR0 so the caption anchors track the true-scale
    // bodies. Drawn by the program's (swap, NEAR0) render step. See the
    // design's migration table (spec line 216).
    const nearLabels = CONTENT_LAYERS.filter((layer) => NEAR_LABEL_NAMES.includes(layer.name));
    expect(nearLabels.map((layer) => layer.name)).toEqual(NEAR_LABEL_NAMES);
    expect(nearLabels).toContain(foregroundLabelsLayer);
    for (const layer of nearLabels) {
      expect(layer.slab).toBe(NEAR0);
      expect(layer.target).toBe('swap');
      expect(layer.blend).toBe('over');
    }
  });
});

describe('CONTENT_LAYERS blend legality', () => {
  it('every layer blends per its target — hdr/volume additive, foreground:0 opaque, swap over', () => {
    // The registry half of the target<->blend invariant (the renderer half
    // — that the WebGPU pipeline's actual blend state matches — lands in
    // task 10). A layer whose target/blend pair falls outside this table
    // is a data-entry bug in its own file, not a new legal combination.
    for (const layer of CONTENT_LAYERS) {
      if (layer.target === 'hdr' || layer.target === 'volume') {
        expect(layer.blend).toBe('additive');
      } else if (layer.target === 'foreground:0') {
        expect(layer.blend).toBe('opaque');
      } else if (layer.target === 'swap') {
        expect(layer.blend).toBe('over');
      } else {
        throw new Error(
          `CONTENT_LAYERS: unexpected target '${layer.target}' on layer '${layer.name}'`,
        );
      }
    }
    // Six layers blend OVER: the five COSMO swap overlays plus the near-field
    // foreground-labels (also swap-target, projected through NEAR0). Was five
    // before the near-field caption row landed.
    expect(CONTENT_LAYERS.filter((layer) => layer.blend === 'over')).toHaveLength(6);
  });
});

describe('scalarVolumeLayer registry row', () => {
  it('leads CONTENT_LAYERS as the volume-target raymarch', () => {
    // The half-res raymarch draws into its own 'volume' offscreen before the
    // hdr group upsamples it, so it sits first in the registry — and its
    // 'volume' target keeps it out of both the hdr and swap groups.
    expect(CONTENT_LAYERS[0]).toBe(scalarVolumeLayer);
    expect(scalarVolumeLayer.name).toBe('scalar-volume');
    expect(scalarVolumeLayer.target).toBe('volume');
    expect(scalarVolumeLayer.slab).toBe(COSMO);
    expect(scalarVolumeLayer.blend).toBe('additive');
    expect(CONTENT_LAYERS.filter((l) => l.target === 'hdr')).not.toContain(scalarVolumeLayer);
    expect(CONTENT_LAYERS.filter((l) => l.target === 'swap')).not.toContain(scalarVolumeLayer);
  });
});

describe('pointSpritesLayer.enabled', () => {
  it('always returns true (no user-facing toggle for point-sprites)', () => {
    expect(pointSpritesLayer.enabled(STATE_STUB, makeCtx())).toBe(true);
    // Even when every other toggle is off, point-sprites still runs.
    expect(pointSpritesLayer.enabled(STATE_STUB, makeCtx())).toBe(true);
  });
});

// Coverage for the `textured-disks` layer lives in
// `texturedDisksLayer.test.ts` (one test file per ContentLayer module,
// matching the convention used by every other entry in `passes/`). The
// hdr-target layers check above pins the name in canonical order.

describe('filamentsLayer.enabled', () => {
  it('returns true when filaments.enabled is true (renderer presence checked in draw)', () => {
    const stateOn = {
      ...STATE_STUB,
      settings: { filaments: { enabled: true, intensity: 1 } },
    } as unknown as EngineState;
    expect(filamentsLayer.enabled(stateOn, makeCtx())).toBe(true);
  });

  it('returns false when filaments.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    expect(filamentsLayer.enabled(stateZeroFade, makeCtx())).toBe(false);
  });

  it('returns true when filaments.enabled is false BUT fade opacity > 0 (fade-out tail still drawing)', () => {
    // STATE_STUB's opacityOf = 1 simulates a fade-out in progress; the
    // gate keeps the layer alive so the user sees the smooth ~100 ms ramp
    // instead of an instant pop.
    const stateOffFading = {
      ...STATE_STUB,
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    expect(filamentsLayer.enabled(stateOffFading, makeCtx())).toBe(true);
  });
});

describe('filamentsLayer.draw', () => {
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
    filamentsLayer.draw(PASS_STUB, view, ctx, stateWith07);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(view.vp);
    expect(args[2]).toEqual(view.viewportPx);
    expect(args[3]).toBe(1.5); // line halfwidth (FILAMENT_LINE_HALFWIDTH_PX)
    expect(args[4]).toBe(0.7);
  });
});

describe('milkyWayLayer.enabled', () => {
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
    expect(milkyWayLayer.enabled(stateOn, ctx)).toBe(true);
  });

  it('returns false when milkyWay.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateOffZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    expect(milkyWayLayer.enabled(stateOffZeroFade, makeCtx())).toBe(false);
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
    expect(milkyWayLayer.enabled(stateOffFading, ctx)).toBe(true);
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
    expect(milkyWayLayer.enabled(stateOn, ctx)).toBe(false);
  });
});

describe('milkyWayLayer.draw', () => {
  it('calls state.gpu.milkyWayCloudRenderer.draw with the packed args when the disc is above the FULL apparent size', () => {
    // Half the FULL-threshold distance → apparent diameter is twice
    // MILKY_WAY_FADE_FULL_PX — fadeAlpha should be 1.0.
    const drawSpy = vi.fn();
    const ctx = makeCtx({
      drawCamPos: [0, 0, MW_FULL_DIST_MPC / 2] as Readonly<[number, number, number]>,
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      gpu: { ...STATE_STUB.gpu, milkyWayCloudRenderer: { draw: drawSpy } },
    } as unknown as EngineState;
    milkyWayLayer.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // New two-pass renderer signature: draw(pass, MilkyWayCloudDrawArgs).
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
      milkyWayLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, STATE_STUB),
    ).not.toThrow();
  });
});

describe('horizonShellLayer.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the layer is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    expect(horizonShellLayer.enabled(STATE_STUB, makeCtx())).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(horizonShellLayer.enabled(STATE_STUB, ctx)).toBe(true);
  });
});

describe('horizonShellLayer.draw', () => {
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
    horizonShellLayer.draw(PASS_STUB, view, ctx, state);
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
      horizonShellLayer.draw(PASS_STUB, slabViewOf(ctx, COSMO), ctx, STATE_STUB),
    ).not.toThrow();
  });
});

// Minimal settings shape for the pointSpritesLayer.draw tests — only
// the fields the layer now reads from `state.settings`.
const POINT_SPRITES_SETTINGS_STUB = {
  galaxyCatalogs: {
    sizePx: 2.5,
    brightness: 1.0,
    highlightFallback: true,
    realOnly: false,
    depthFade: true,
  },
  bias: {
    mode: BiasMode.None,
    absMagLimit: -19,
  },
} as unknown as EngineState['settings'];

describe('pointSpritesLayer.draw', () => {
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
    pointSpritesLayer.draw(PASS_STUB, view, ctx, stateWithSelection);
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Selection lives on arg[3].selectedPacked (the PointDrawSettings
    // record).
    const expected = ((Source.SDSS << 27) | 42) >>> 0;
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
    pointSpritesLayer.draw(PASS_STUB, view, ctx, stateNullSelection);
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    const drawSettings = drawSpy.mock.calls[0]![3] as Record<string, unknown>;
    expect(drawSettings.selectedPacked).toBe(0xffffffff >>> 0);
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
    pointSpritesLayer.draw(PASS_STUB, view, ctx, stateNullSelection);
    const drawSpy = ctx.renderer.draw as ReturnType<typeof vi.fn>;
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    const drawSettings = call[3] as Record<string, unknown>;
    expect(drawSettings.camPosWorld).toEqual(view.camPos);
  });
});

describe('drawPick migration-table rows', () => {
  it('exactly the four cosmological pickables expose drawPick, in registry order', () => {
    // Pins the spec's migration table: only pointSprites / proceduralDisks /
    // milkyWay / structureMarkers participate in picking, and they do so in
    // registry order (pointSprites first — the @group(0) prefix contract).
    // The production code stays name-blind: the pick program filters by
    // `drawPick` presence + `enabled`, never a hardcoded name list — so this
    // test is the ONLY place the four names are asserted.
    expect(CONTENT_LAYERS.filter((layer) => layer.drawPick).map((layer) => layer.name)).toEqual([
      'point-sprites',
      'procedural-disks',
      'milky-way',
      'structure-markers',
    ]);
  });
});

describe('pointSpritesLayer.drawPick', () => {
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
      renderer: { draw: vi.fn(), loadedSources: () => loaded } as any,
      visibleSourceMask: (1 << Source.SDSS) | (1 << Source.Glade),
    });
    const view = slabViewOf(ctx, COSMO);
    const state = {
      ...STATE_STUB,
      selection: { select: null, hover: null, focus: null },
      settings: POINT_SPRITES_SETTINGS_STUB,
      gpu: { ...STATE_STUB.gpu, pickRenderer: { drawPoints: drawPointsSpy } },
    } as unknown as EngineState;

    pointSpritesLayer.drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    // arg[1] is the filtered `sources` list handed to drawPoints.
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.SDSS, Source.Glade]);
  });
});
