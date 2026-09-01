import { describe, it, expect, vi } from 'vitest';
import { near0SelectionRingLayer } from '../../../../../src/services/engine/frame/passes/near0SelectionRingLayer';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../../src/data/sources';
import { near0RingRadiusPx } from '../../../../../src/services/engine/helpers/near0RingRadiusPx';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { makeGalaxyRow } from '../../../../fixtures/makeGalaxyRow';

// The enable gate never touches ctx or view — bare casts stand in for both.
const CTX = {} as unknown as ReadyFrameContext;
const VIEW_STUB = {} as unknown as SlabView;

// A minimal stand-in for the shared selection-ring renderer handle.
function makeRendererSpy() {
  return { label: 'selectionRingRenderer', draw: vi.fn(), destroy: vi.fn() };
}

// The star arm — a self-contained display projection of a picked survey star.
const STAR_ROW: SelectionRow = {
  type: 'star',
  index: 7,
  positionMpc: [0.001, -0.002, 0.0005],
  absMag: 4.8,
  bpRp: 0.65,
  radiusM: 696340000,
};

// A galaxy row — yields a NON-null halo, but tagged COSMO. It exercises the
// distinction between "no halo" and "halo for the other slab".
const GALAXY_ROW: SelectionRow = makeGalaxyRow({
  source: Source.Glade,
  z: 100,
  diameterKpc: 60,
  axisRatio: 1,
});

// A structure row — drives the cluster marker pass, never this halo.
const STRUCTURE_ROW: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

function stateWith(row: SelectionRow | null, renderer: unknown = makeRendererSpy()): EngineState {
  return {
    gpu: { selectionRingRenderer: renderer },
    selectionRows: { select: row, focus: null, hover: null },
    settings: { galaxyCatalogs: { sizePx: 2 } },
  } as unknown as EngineState;
}

describe('near0SelectionRingLayer.enabled', () => {
  it('is true when a star row is selected and the renderer is present', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(STAR_ROW), CTX, VIEW_STUB)).toBe(true);
  });

  it('is false when the renderer is null (pre-bootstrap)', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(STAR_ROW, null), CTX, VIEW_STUB)).toBe(false);
  });

  it('is false when nothing is selected', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(null), CTX, VIEW_STUB)).toBe(false);
  });

  it('is false for a structure row (the marker pass owns that halo)', () => {
    expect(
      near0SelectionRingLayer.enabled(stateWith(STRUCTURE_ROW as SelectionRow), CTX, VIEW_STUB),
    ).toBe(false);
  });

  // The race guard: a galaxy yields a NON-null halo, but tagged COSMO. If this
  // layer gated on halo-presence alone it would enable here, and both ring
  // layers would write the shared renderer in one frame. Gating on the slab
  // keeps it disabled so only the COSMO sibling draws.
  it('is false for a galaxy row (COSMO-tagged halo present, but not this slab)', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(GALAXY_ROW), CTX, VIEW_STUB)).toBe(false);
  });
});

// A NEAR0 star anchor whose camera-relative distance sits well OUTSIDE the
// adaptive far plane — the exact condition that produced the reported bug:
// with the camera orbiting something much nearer, `slab.far`
// (foregroundFrustum's `orbit × 100`) drops below the pinned star's anchor
// distance, and the un-clamped ring quad frustum-clips away while the star
// sprite (which clamps clip-z) survives.
const FAR_STAR_ROW: SelectionRow = {
  type: 'star',
  index: 3,
  positionMpc: [3e-5, 4e-5, 0], // camera at origin ⇒ camDist 5e-5 Mpc
  absMag: 4.8,
  bpRp: 0.65,
  radiusM: 696340000,
};

// A SlabView with `slab.far` BELOW the star's camDist. camPos at the origin
// so the camera-relative centre equals worldPos. `vp`/`camPos`/`viewportPx` are
// the shape the renderer spy reads without interpreting.
function farClippingView(farMpc: number): SlabView {
  return {
    slab: {
      index: 0,
      near: 1e-10,
      far: farMpc,
      vp: new Float64Array(16),
      frame: { kind: 'world-mpc', originRelative: true },
      precision: 'f64',
      reversedZ: false,
    },
    vp: new Float32Array(16),
    camPos: [0, 0, 0],
    viewportPx: [1920, 1080],
  } as unknown as SlabView;
}

describe('near0SelectionRingLayer.draw — far-plane clamp regression', () => {
  it('pulls the ring centre inside the far plane while sizing from the TRUE distance', () => {
    const renderer = makeRendererSpy();
    const state = stateWith(FAR_STAR_ROW, renderer);

    const trueCamDist = Math.hypot(3e-5, 4e-5, 0); // 5e-5 Mpc
    const farMpc = 1e-6; // far below the anchor distance ⇒ would clip un-clamped
    const view = farClippingView(farMpc);
    const ctx = { drawPxPerRad: 1000 } as unknown as ReadyFrameContext;

    const pass = {} as unknown as GPURenderPassEncoder;
    near0SelectionRingLayer.draw(pass, view, ctx, state);

    expect(renderer.draw).toHaveBeenCalledTimes(1);
    const [, , , opts] = renderer.draw.mock.calls[0]!;
    const handed = opts.worldPos as [number, number, number];
    const handedLen = Math.hypot(handed[0], handed[1], handed[2]);

    // Clamped inside the far plane so the quad is no longer frustum-clipped.
    expect(handedLen).toBeLessThanOrEqual(farMpc);
    // Direction preserved — still collinear with the un-clamped anchor.
    expect(handed[0] / handed[1]).toBeCloseTo(3e-5 / 4e-5, 12);

    // Ring size still reflects the TRUE camera distance, not the clamped length:
    // the 1.5×-apparent sizing must stay physical.
    const expectedPx = near0RingRadiusPx(
      696340 * SCALE_UNITS.KM_TO_MPC,
      trueCamDist,
      1000,
      state.settings.galaxyCatalogs.sizePx,
    );
    expect(opts.ringRadiusPx).toBeCloseTo(expectedPx, 12);
  });
});

describe('near0SelectionRingLayer.draw — live body position', () => {
  // A body's SelectionRow snapshots its position at pick time, but the sim clock
  // keeps orbiting it. The ring must centre on the LIVE position this frame, not
  // the stale snapshot. This fails against the old code, which centred on
  // `halo.worldPos` (= the stale `row.positionMpc`).
  it('centres on the live snapshot position, not the stale row position', () => {
    // Advance well past epoch so the derived Earth position is clearly not the
    // stale row snapshot — the exact reported bug.
    const simDays = CONST_J2000 + 300;
    const livePos = deriveBodyStates(simDays).get('earth')!.positionMpc;

    // A deliberately-wrong snapshot: a magnitude/direction the live Earth never
    // has (Earth's heliocentric offset is ~1 AU ≈ 5e-12 Mpc). Both stay well
    // inside the far plane below, so neither is length-clamped.
    const staleRow: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [1e-6, 0, 0],
      radiusM: 6371000,
    };

    const renderer = makeRendererSpy();
    const state = stateWith(staleRow, renderer);
    const view = farClippingView(1); // farMpc 1 Mpc ⇒ no clamp at this scale
    const ctx = { simDays, drawPxPerRad: 1000 } as unknown as ReadyFrameContext;

    near0SelectionRingLayer.draw({} as unknown as GPURenderPassEncoder, view, ctx, state);

    const [, , , opts] = renderer.draw.mock.calls[0]!;
    const handed = opts.worldPos as [number, number, number];

    // camPos is the origin, so the handed camera-relative centre equals the live
    // world position — and is NOT the stale [1e-6, 0, 0] snapshot.
    expect(handed[0]).toBeCloseTo(livePos[0], 15);
    expect(handed[1]).toBeCloseTo(livePos[1], 15);
    expect(handed[2]).toBeCloseTo(livePos[2], 15);
    expect(Math.hypot(handed[0], handed[1], handed[2])).not.toBeCloseTo(1e-6, 9);
  });
});
