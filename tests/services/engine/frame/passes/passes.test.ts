/**
 * passes — the per-layer `enabled` gates and the `CONTENT_LAYERS` table shape,
 * against stub state + ctx with no GPU device. The spot-checked `draw` calls pin
 * that a layer threads the resolved `SlabView`'s `vp`/`viewportPx` rather than
 * reading `ctx.vp`/`ctx.canvasSize` directly.
 *
 * Encoder sequencing and the post-process chain live in `renderFrame.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';

import { Source } from '../../../../../src/data/sources';
import { packSelection } from '../../../../../src/data/selectionEncoding';
import { BiasMode } from '../../../../../src/data/galaxyCatalog/biasMode';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../../../src/data/defaults';
import {
  CONTENT_LAYERS,
  scalarVolumeLayer,
  galaxyPointSpritesLayer,
  filamentsLayer,
  earthLayer,
  planetsLayer,
  texturedBodiesLayer,
  milkyWayLayer,
  horizonShellLayer,
  starPointsLayer,
  orbitTrailsLayer,
  starCatalogLayer,
  starAggregatesLayer,
  starAggregateUpsampleLayer,
  foregroundLabelsLayer,
  near0SelectionRingLayer,
  clipPathDebugLayer,
  structureMarkersLayer,
} from '../../../../../src/services/engine/frame/passes';
import { COSMO, NEAR0, slabViewOf } from '../../../../../src/services/engine/frame/slabs';
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
// `galaxyPointSpritesLayer` reads `state.subsystems.fades.opacityOf` for
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
  // galaxyPointSpritesLayer / disk layers bind the shared focus group off
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
  'filaments',
  'flow',
  'volume-upsample',
  'horizon-shell',
  'structure-markers',
];

// The canonical (swap, COSMO) group (post-tone-map, premultiplied-OVER) name
// order — see the renderer-unification design's migration table (spec lines
// 208-212). Selection ring leads so marker-lines and labels composite over its
// stroke. The debug clip-path overlay is NOT here: it projects through NEAR0
// (so a near-field route clears the cosmological near plane) — see
// NEAR_SWAP_NAMES below.
const SWAP_NAMES = ['selection-ring', 'disk-radius-ring', 'marker-lines', 'labels'];

// The near-field foreground group: the true-scale bodies drawn into the
// depth-bearing `foreground:0` target through the near0 slab — the Sun
// sphere and the selection-gated focused field-star sphere. Opaque
// (depth-tested), unlike the additive HDR group and the OVER swap group. The
// focused-field-star sphere sits right after star-spheres — a selection-gated
// sibling reusing the same star renderer.
// Earth, the partition's `planets`/`textured-bodies` branches, and the
// translucent `cloud-shell`/`rings`/`atmosphere-shell` overlays are NOT in
// this list: all ride the 'body' slab sentinel (Tasks 9-11, body render
// slabs) instead of a fixed NEAR0 index — their own registry-row tests below
// pin them separately.
const FOREGROUND_NAMES = ['star-spheres', 'field-star-sphere'];

// The near-field hdr rows: the layers that pair the hdr target with the
// near0 slab — additive like every hdr row, but projected through NEAR0 so
// kpc-to-AU-scale anchors clear the near plane. One (hdr, NEAR0) render
// group, driven by the program's dedicated step before the tone-map: the
// Milky-Way cloud's UPSAMPLE composite first, then the cloud's dust pass (its
// multiplicative transmittance must land on the upsampled starlight, and must
// never darken the local starfield drawn after it), then the far-partition
// star points, the orbit trails, the survey star LEAF catalog, and the survey
// aggregate UPSAMPLE composite (adjacent to the leaf draw it composites).
// Neither aggregate STREAM is here — the Milky Way's star billboards target
// 'mw-aggregate' and the survey's target 'star-aggregates', so both sit
// outside the hdr group.
const NEAR_HDR_NAMES = [
  'milky-way-upsample',
  'milky-way',
  'star-points',
  'orbit-trails',
  'body-glints',
  'star-catalog',
  'star-upsample',
  'constellations',
];

// The near-field swap group: the overlays that pair the swap target with the
// near0 slab. Like the COSMO swap overlays they premultiply-OVER post-tone-map,
// but they project through the near0 slab so their anchors track true-scale
// near-field content rather than being clipped by the cosmological near plane.
// Its own (swap, NEAR0) render group, distinct from the (swap, COSMO) overlays
// above: the star selection ring first (so its stroke sits under the caption,
// mirroring the COSMO ring→labels order), then the scene-body name captions,
// then the clip-path inspector overlay LAST (so its debug route + gizmo draw on
// top of everything). The clip-path overlay projects through NEAR0 so a
// near-field clip's route — Earth-to-parsec, wholly inside COSMO's 10 kpc near
// plane — is not clipped to nothing.
const NEAR_SWAP_NAMES = ['near0-selection-ring', 'foreground-labels', 'clip-path-debug'];

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
  it('the (hdr, NEAR0) group holds milky-way-upsample, milky-way, star-points, orbit-trails, star-catalog, additive', () => {
    // The hdr rows outside the cosmological slab: the Milky-Way cloud's
    // upsample + dust, the far-partition neighbourhood stars, and the orbit
    // trails, projected through NEAR0 (COSMO's FIXED 0.01 Mpc near plane would
    // clip their kpc-to-AU-scale anchors — for the Milky Way it clipped the
    // disc mid-descent before the approach fade completed) but accumulating
    // into the same HDR target so they ride the galaxies' tone-map. Drawn by
    // the program's dedicated (hdr, NEAR0) step before the hdr→swap composite.
    // The two Milky-Way rows MUST lead, in this order: the upsample adds the
    // cloud's own starlight into HDR, then the multiplicative dust extincts it
    // along with the cosmological accumulation behind it — and leading the
    // group keeps the local starfield drawn after out of that multiply.
    const nearHdr = CONTENT_LAYERS.filter(
      (layer) => layer.target === 'hdr' && layer.slab === NEAR0,
    );
    expect(nearHdr.map((layer) => layer.name)).toEqual(NEAR_HDR_NAMES);
    expect(nearHdr).toContain(milkyWayLayer);
    expect(nearHdr).toContain(starPointsLayer);
    expect(nearHdr).toContain(orbitTrailsLayer);
    expect(nearHdr).toContain(starCatalogLayer);
    expect(nearHdr).toContain(starAggregateUpsampleLayer);
    for (const layer of nearHdr) {
      expect(layer.slab).toBe(NEAR0);
      expect(layer.target).toBe('hdr');
      expect(layer.blend).toBe(layer === milkyWayLayer ? 'multiply' : 'additive');
    }
  });
});

describe('CONTENT_LAYERS migration table (swap group)', () => {
  it('every swap content layer matches the migration table', () => {
    // The COSMO post-tone-map UI overlays project through the same
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
    // The near-field bodies still on a fixed NEAR0 index (the Sun sphere, the
    // focused field star): project through NEAR0 into the depth-bearing
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

  it("earth, planets, and textured-bodies ride the 'body' slab sentinel into foreground:0, opaque", () => {
    // Task 9 (earth) / Task 11 (planets, textured-bodies): each expands into
    // one render step per body-m row instead of a fixed NEAR0 index — see
    // frameProgram.ts's 'body' expansion.
    for (const layer of [earthLayer, planetsLayer, texturedBodiesLayer]) {
      expect(layer.slab).toBe('body');
      expect(layer.target).toBe('foreground:0');
      expect(layer.blend).toBe('opaque');
    }
  });
});

describe('CONTENT_LAYERS migration table (near-field swap group)', () => {
  it('the star selection ring, scene-body captions, and clip-path overlay draw into swap through the near0 slab, over', () => {
    // The (swap, NEAR0) group: like the COSMO swap overlays these target the
    // swap chain with premultiplied-OVER, but they project through NEAR0 so
    // their anchors track true-scale near-field content (a picked star, a body
    // caption, a near-field clip's route) rather than being clipped by the
    // cosmological near plane. Drawn by the program's (swap, NEAR0) render step,
    // filtered here by (target, slab) so a mis-registered member surfaces — the
    // ring leads the caption, the clip-path overlay trails.
    const nearSwap = CONTENT_LAYERS.filter(
      (layer) => layer.target === 'swap' && layer.slab === NEAR0,
    );
    expect(nearSwap.map((layer) => layer.name)).toEqual(NEAR_SWAP_NAMES);
    expect(nearSwap).toContain(near0SelectionRingLayer);
    expect(nearSwap).toContain(foregroundLabelsLayer);
    expect(nearSwap).toContain(clipPathDebugLayer);
    for (const layer of nearSwap) {
      expect(layer.slab).toBe(NEAR0);
      expect(layer.target).toBe('swap');
      expect(layer.blend).toBe('over');
    }
  });
});

describe('CONTENT_LAYERS blend legality', () => {
  it('every layer blends per its target — hdr/volume additive, foreground:0 opaque, swap over', () => {
    // The registry half of the target<->blend invariant — the renderer half,
    // that the WebGPU pipeline's actual blend state matches, is covered
    // elsewhere. A layer whose target/blend pair falls outside this table is
    // a data-entry bug in its own file, not a new legal combination.
    for (const layer of CONTENT_LAYERS) {
      if (
        layer.target === 'volume' ||
        layer.target === 'zoa' ||
        layer.target === 'star-aggregates' ||
        layer.target === 'mw-aggregate'
      ) {
        // These four reduced-resolution offscreens accumulate the same way
        // their contents would have accumulated straight into HDR — the
        // raymarched volume, the zone-of-avoidance band raymarch, the
        // survey aggregate glow, and the Milky Way cloud's star
        // billboards are all additive sums, which is what makes "render
        // small, bilinearly upsample, add" equivalent to drawing them
        // full-res. A non-additive row here would break that equivalence, so
        // it's a correctness bug, not a new legal combination.
        expect(layer.blend).toBe('additive');
      } else if (layer.target === 'hdr') {
        // hdr admits exactly one multiplicative row: the Milky Way dust pass
        // extincts the emission already accumulated in HDR rather than adding
        // to it, which is why its position in the near-hdr group is
        // load-bearing. A second multiplicative hdr row should fail this test
        // and be a deliberate decision.
        expect(layer.blend).toBe(layer === milkyWayLayer ? 'multiply' : 'additive');
      } else if (layer.target === 'foreground:0') {
        // The `foreground:0` group is opaque bodies EXCEPT the three translucent
        // overlays — the ring, Earth's cloud shell, and Earth's in-scatter
        // atmosphere — each drawn AFTER the opaque spheres, depth-tested against
        // them but writing no depth, straight-alpha OVER (spec §8 / §8.3 / grill
        // Q9). Their pipelines bake exactly that profile (foreground:0 formats,
        // depth read / no write, over blend), so those rows legitimately carry
        // `over` where their siblings carry `opaque` — one of two targets that
        // admit two blends today (hdr's dust row is the other).
        if (
          layer.name === 'rings' ||
          layer.name === 'cloud-shell' ||
          layer.name === 'atmosphere-shell'
        ) {
          expect(layer.blend).toBe('over');
        } else {
          expect(layer.blend).toBe('opaque');
        }
      } else if (layer.target === 'swap') {
        expect(layer.blend).toBe('over');
      } else if (/^bloom[0-4]$/.test(layer.target)) {
        // The bloom mip pyramid rows: the bright prefilter and the four
        // downsample folds OVERWRITE their target (opaque — each is its target's
        // sole producer), while the four upsample folds accumulate ADDITIVELY
        // onto the finer level. So a `bloomN` target legitimately admits both
        // blends, split by which stage draws it: `bloom-up-*` is additive, the
        // bright + `bloom-down-*` producers are opaque. (The final fold targets
        // `hdr`, additive — covered by the `hdr` branch above.)
        if (layer.name.startsWith('bloom-up-')) {
          expect(layer.blend).toBe('additive');
        } else {
          expect(layer.blend).toBe('opaque');
        }
      } else {
        throw new Error(
          `CONTENT_LAYERS: unexpected target '${layer.target}' on layer '${layer.name}'`,
        );
      }
    }
    // Ten layers blend OVER: the four COSMO swap overlays, the three (swap,
    // NEAR0) overlays (the near0 star selection ring, foreground-labels, and the
    // clip-path inspector route — moved here from the COSMO swap group so a
    // near-field clip's parsec-scale route is not clipped by the cosmological
    // near plane), and the three translucent foreground members — the ring,
    // Earth's cloud shell, and Earth's in-scatter atmosphere (the three OVER
    // members of the otherwise-opaque foreground group).
    expect(CONTENT_LAYERS.filter((layer) => layer.blend === 'over')).toHaveLength(10);
  });
});

describe('ringsLayer registry row', () => {
  it("rides the 'body' slab sentinel into foreground:0 with over, AFTER the opaque bodies", () => {
    // The ring is the translucent overlay half of Saturn's rings: it shares the
    // opaque bodies' (foreground:0, 'body') render step but blends OVER, so it
    // must be ordered after them to depth-test against their stamped z (far ring
    // half occluded). Task 11 moved it off the fixed NEAR0 index onto the same
    // 'body' expansion earth/planets/textured-bodies use. It is deliberately
    // NOT in FOREGROUND_NAMES (that group's opaque assertion), it is the
    // exception.
    const rings = CONTENT_LAYERS.find((layer) => layer.name === 'rings')!;
    expect(rings).toBeDefined();
    expect(rings.slab).toBe('body');
    expect(rings.target).toBe('foreground:0');
    expect(rings.blend).toBe('over');

    const idxTextured = CONTENT_LAYERS.findIndex((layer) => layer.name === 'textured-bodies');
    const idxRings = CONTENT_LAYERS.findIndex((layer) => layer.name === 'rings');
    expect(idxRings).toBeGreaterThan(idxTextured);
  });
});

describe('cloudShellLayer registry row', () => {
  it("rides the 'body' slab sentinel into foreground:0 with over, AFTER earth", () => {
    // Earth's cloud deck is the second translucent overlay of the (foreground:0,
    // 'body') group: it blends OVER, so it must be ordered after the opaque
    // surface earthLayer stamps, to depth-test against its z (far hemisphere
    // occluded). Task 10 (body render slabs) moved it off the fixed NEAR0 index
    // onto the same 'body' expansion earthLayer uses — see frameProgram.ts. It
    // is deliberately NOT in FOREGROUND_NAMES (that group's opaque assertion) —
    // it is the exception, alongside the ring.
    const cloud = CONTENT_LAYERS.find((layer) => layer.name === 'cloud-shell')!;
    expect(cloud).toBeDefined();
    expect(cloud.slab).toBe('body');
    expect(cloud.target).toBe('foreground:0');
    expect(cloud.blend).toBe('over');

    const idxEarth = CONTENT_LAYERS.findIndex((layer) => layer.name === 'earth');
    const idxCloud = CONTENT_LAYERS.findIndex((layer) => layer.name === 'cloud-shell');
    expect(idxCloud).toBeGreaterThan(idxEarth);
  });
});

describe('atmosphereShellLayer registry row', () => {
  it("rides the 'body' slab sentinel into foreground:0 with over, LAST — after the rings overlay", () => {
    // Earth's in-scatter atmosphere is the outermost translucent overlay of the
    // (foreground:0, 'body') group (spec §8.3): it blends OVER and must be
    // ordered AFTER every opaque sphere AND the ring overlay, so it depth-tests
    // against their stamped z (over-disc occluded, limb over space passes).
    // Task 10 moved it off the fixed NEAR0 index onto the same 'body' expansion
    // earthLayer uses. It is deliberately NOT in FOREGROUND_NAMES (that group's
    // opaque assertion) — it is the third exception, alongside the ring and
    // cloud shell. Non-pickable.
    const atmosphere = CONTENT_LAYERS.find((layer) => layer.name === 'atmosphere-shell')!;
    expect(atmosphere).toBeDefined();
    expect(atmosphere.slab).toBe('body');
    expect(atmosphere.target).toBe('foreground:0');
    expect(atmosphere.blend).toBe('over');
    expect(atmosphere.drawPick).toBeUndefined();

    // It is the LAST foreground:0 layer in registry order (after the ring), so
    // its draw trails every opaque + translucent sibling in the group.
    const idxRings = CONTENT_LAYERS.findIndex((layer) => layer.name === 'rings');
    const idxAtmosphere = CONTENT_LAYERS.findIndex((layer) => layer.name === 'atmosphere-shell');
    expect(idxAtmosphere).toBeGreaterThan(idxRings);
    const fgIndices = CONTENT_LAYERS.map((layer, i) => ({ layer, i })).filter(
      ({ layer }) => layer.target === 'foreground:0',
    );
    expect(fgIndices[fgIndices.length - 1]!.layer).toBe(atmosphere);
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

describe('starAggregatesLayer registry row', () => {
  it('draws into the star-aggregates offscreen through NEAR0, additive, and stays out of the hdr group', () => {
    // The survey-star AGGREGATE stream draws LINEAR into its own half-res
    // offscreen via a dedicated (star-aggregates, NEAR0) render step, so its
    // 'star-aggregates' target keeps it out of both the hdr and swap groups —
    // the same isolation `scalar-volume` gets from its 'volume' target.
    expect(starAggregatesLayer.name).toBe('star-aggregates');
    expect(starAggregatesLayer.target).toBe('star-aggregates');
    expect(starAggregatesLayer.slab).toBe(NEAR0);
    expect(starAggregatesLayer.blend).toBe('additive');
    expect(CONTENT_LAYERS.filter((l) => l.target === 'hdr')).not.toContain(starAggregatesLayer);
    expect(CONTENT_LAYERS.filter((l) => l.target === 'swap')).not.toContain(starAggregatesLayer);
    // The upsample consumer and the aggregate producer share ONE visibility
    // gate, so a frame can never composite a stale offscreen the producer
    // skipped clearing.
    expect(starAggregateUpsampleLayer.enabled).toBe(starAggregatesLayer.enabled);
  });
});

describe('galaxyPointSpritesLayer.enabled', () => {
  it('always returns true (no user-facing toggle for point-sprites)', () => {
    const ctx = makeCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(galaxyPointSpritesLayer.enabled(STATE_STUB, ctx, view)).toBe(true);
    // Even when every other toggle is off, point-sprites still runs.
    expect(galaxyPointSpritesLayer.enabled(STATE_STUB, ctx, view)).toBe(true);
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
    const ctx = makeCtx();
    expect(filamentsLayer.enabled(stateOn, ctx, slabViewOf(ctx, COSMO))).toBe(true);
  });

  it('returns false when filaments.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { filaments: { enabled: false, intensity: 1 } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(filamentsLayer.enabled(stateZeroFade, ctx, slabViewOf(ctx, COSMO))).toBe(false);
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
    expect(filamentsLayer.enabled(stateOffFading, ctx, slabViewOf(ctx, COSMO))).toBe(true);
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
    expect(milkyWayLayer.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
  });

  it('returns false when milkyWay.enabled is false AND fade opacity is 0', () => {
    // fades.opacityOf returns 0 so the gate doesn't keep the layer alive
    // through a fade-out tail; toggle is also off — both conditions false.
    const stateOffZeroFade = {
      subsystems: { fades: { opacityOf: () => 0, isAnyAnimating: () => false } },
      settings: { milkyWay: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(milkyWayLayer.enabled(stateOffZeroFade, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
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
    expect(milkyWayLayer.enabled(stateOffFading, ctx, slabViewOf(ctx, NEAR0))).toBe(true);
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
    expect(milkyWayLayer.enabled(stateOn, ctx, slabViewOf(ctx, NEAR0))).toBe(false);
  });
});

describe('milkyWayLayer.draw', () => {
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
    milkyWayLayer.draw(PASS_STUB, view, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // This row draws ONLY the dust pass now — the additive star pass moved to
    // milkyWayAggregateLayer, which renders it into the reduced-resolution
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
      milkyWayLayer.draw(PASS_STUB, slabViewOf(ctx, NEAR0), ctx, STATE_STUB),
    ).not.toThrow();
  });
});

describe('horizonShellLayer.enabled', () => {
  it('returns false near the origin — the inverse of the Milky-Way band', () => {
    // Camera at 5 Mpc is far below the shell's fade-in band (5% of
    // 14.3 Gpc ≈ 0.7 Gpc), so the layer is skipped — no empty
    // full-screen ray-march pass at galaxy-scale zoom.
    const ctx0 = makeCtx();
    expect(horizonShellLayer.enabled(STATE_STUB, ctx0, slabViewOf(ctx0, COSMO))).toBe(false);
  });

  it('returns true once the camera pulls back to cosmological scale', () => {
    // 8 Gpc is past the 40%-of-radius full-strength point (~5.7 Gpc).
    const ctx = makeCtx({
      drawCamPos: [0, 0, 8000] as Readonly<[number, number, number]>,
    });
    expect(horizonShellLayer.enabled(STATE_STUB, ctx, slabViewOf(ctx, COSMO))).toBe(true);
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

// Minimal settings shape for the galaxyPointSpritesLayer.draw tests — only
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

describe('galaxyPointSpritesLayer.draw', () => {
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
    galaxyPointSpritesLayer.draw(PASS_STUB, view, ctx, stateWithSelection);
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
    galaxyPointSpritesLayer.draw(PASS_STUB, view, ctx, stateNullSelection);
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
    galaxyPointSpritesLayer.draw(PASS_STUB, slabViewOf(farCtx, COSMO), farCtx, state);
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
    galaxyPointSpritesLayer.draw(PASS_STUB, slabViewOf(midCtx, COSMO), midCtx, state);
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
    galaxyPointSpritesLayer.draw(PASS_STUB, slabViewOf(deepCtx, COSMO), deepCtx, state);
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
    galaxyPointSpritesLayer.draw(PASS_STUB, view, ctx, stateNullSelection);
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
  it('exactly the twelve pickables expose drawPick, in registry order', () => {
    // Pins the spec's migration table: the six COSMO/near-field survey
    // pickables (pointSprites / zoneOfAvoidance / proceduralDisks /
    // structureMarkers / milkyWay / starCatalog) PLUS the six NEAR0 true-scale
    // foreground bodies (starPoints / bodyGlints / earth / starSpheres /
    // focusedFieldStarSphere / planets), the selection-gated
    // focused-field-star sphere's pick and the sub-pixel body glints' pick
    // among them. Order is registry order: the COSMO pick pass leads with
    // point-sprites (the @group(0) prefix contract); zone-of-avoidance sits
    // right after it in the registry for exactly that reason — its own
    // 'zoa' render target keeps it out of every VISUAL group regardless of
    // array position, but the pick program groups by slab alone and needs
    // this row after the one that establishes the shared camera. Every NEAR0
    // body self-binds its own slot-0 camera in its own pass, so their
    // relative order carries no @group(0) dependence (it is depth-resolved,
    // nearest-wins). The production code stays name-blind — the pick program
    // filters by `drawPick` presence + `enabled`, never a hardcoded name
    // list — so this test is the ONLY place the twelve names are asserted.
    expect(CONTENT_LAYERS.filter((layer) => layer.drawPick).map((layer) => layer.name)).toEqual([
      'point-sprites',
      'zone-of-avoidance',
      'procedural-disks',
      'structure-markers',
      'milky-way',
      'star-points',
      'body-glints',
      'star-catalog',
      'earth',
      'star-spheres',
      'field-star-sphere',
      'planets',
    ]);
  });
});

describe('structureMarkersLayer.enabled', () => {
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
    expect(structureMarkersLayer.enabled(state, farCtx, slabViewOf(farCtx, COSMO))).toBe(true);
    // Inside goneAt (0.002 Mpc) → disabled despite queued markers.
    const nearCtx = makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> });
    expect(structureMarkersLayer.enabled(state, nearCtx, slabViewOf(nearCtx, COSMO))).toBe(false);
  });
});

describe('galaxyPointSpritesLayer.drawPick', () => {
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

    galaxyPointSpritesLayer.drawPick!(PASS_STUB, view, ctx, state);

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

    galaxyPointSpritesLayer.drawPick!(PASS_STUB, view, ctx, state);

    expect(drawPointsSpy).toHaveBeenCalledTimes(1);
    const passedSources = drawPointsSpy.mock.calls[0]![1] as ReadonlyArray<{ source: number }>;
    expect(passedSources.map((s) => s.source)).toEqual([Source.FamousGalaxy]);
  });
});
