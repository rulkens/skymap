import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { produceStructureMarkers } from '../../../../src/layers/structure/present/produceStructureMarkers';
import { MILD_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { createStructureStore } from '../../../../src/layers/structure/load/createStructureStore';
import type { StructureStore } from '../../../../src/layers/structure/@types/StructureStore';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureId } from '../../../../src/@types/data/structure/StructureId';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import {
  STRUCTURE_MARKER_STYLES,
  SELECTED_RING_BRIGHTEN,
  HOVERED_RING_BRIGHTEN,
  RING_PICK_MIN_ALPHA,
} from '../../../../src/layers/structure/present/structureMarkerStyles';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { structurePickId } from '../../../../src/utils/picking/structurePickId';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';

// Builds a real structure store (so `state.store` is the production store) and
// state.selection refs that drive the ring bump, then drives the producer. The
// per-category fade is the handed value: `handed` builds it.
type TestState = EngineState & { store: StructureStore };

/** The value core hands: every category at `rest`, with per-category overrides. */
function handed(
  rest = 1,
  over: Partial<Record<StructureId, number>> = {},
): Readonly<Record<StructureId, number>> {
  return Object.fromEntries(STRUCTURE_IDS.map((c) => [c, over[c] ?? rest])) as Record<
    StructureId,
    number
  >;
}
const ONE = handed();

function makeState(
  selectedStructureId: string | null = null,
  focusedStructureId: string | null = selectedStructureId,
): TestState {
  return {
    store: createStructureStore(),
    selection: {
      select: selectedStructureId !== null ? { type: 'structure', id: selectedStructureId } : null,
      focus: focusedStructureId !== null ? { type: 'structure', id: focusedStructureId } : null,
      hover: null,
    },
  } as unknown as TestState;
}

// Past the surveyDeepZoom band's full edge, so the visibility band is 1 and
// the structures sit ~10 Mpc away to within 0.01%.
const FULL_BAND_CAM_Z = SCALE_FADE_BANDS.surveyDeepZoom.fullAt * 1.01;

function makeCtx(
  focusBlend = 0,
  camDistMpc = FULL_BAND_CAM_Z,
  focusPickId: number | null = null,
): FrameView {
  return {
    snapshot: { focusBlend, focusPickId, nowMs: 0, focus: ZERO_FOCUS },
    drawCamPos: [0, 0, camDistMpc],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    vp: mat4.identity(),
  } as unknown as FrameView;
}

const rec = (
  id: string,
  category: StructureInfo['category'] = 'galaxy-cluster',
  over: Partial<StructureInfo> = {},
): StructureInfo =>
  ({
    id,
    name: id,
    worldPos: [10, 0, 0],
    category,
    featured: true,
    physicalRadiusMpc: 5,
    ...over,
  }) as StructureInfo;

describe('produceStructureMarkers', () => {
  it('emits one descriptor per marker-bearing structure in all() order (anchors → bulk)', () => {
    const state = makeState();
    state.store.setGroup('bulk', [rec('b1'), rec('b2')]);
    state.store.setGroup('anchors', [rec('a1')]);
    const markers = produceStructureMarkers(state.store, state, makeCtx(), ONE);
    expect(markers.map((m) => m.id)).toEqual(['a1', 'b1', 'b2']);
  });

  it('emits an alpha-0 descriptor for a fully-faded (far) structure (pick-index alignment)', () => {
    const state = makeState();
    // Near structure (visible) + far structure (apparent radius below the min
    // floor → faded). Both MUST emit so the per-category index stays aligned.
    state.store.setGroup('bulk', [
      rec('near'),
      rec('far', 'galaxy-cluster', { worldPos: [10000, 0, 0] }),
    ]);
    const markers = produceStructureMarkers(state.store, state, makeCtx(), ONE);
    expect(markers.map((m) => m.id)).toEqual(['near', 'far']);
    const far = markers.find((m) => m.id === 'far')!;
    expect(far.ringColor[3]).toBe(0);
    expect(far.haloColor[3]).toBe(0);
  });

  it('skips a category whose handed value is 0', () => {
    const state = makeState();
    state.store.setGroup('bulk', [rec('c1', 'galaxy-cluster'), rec('v1', 'void')]);
    const markers = produceStructureMarkers(
      state.store,
      state,
      makeCtx(),
      handed(1, { 'galaxy-cluster': 0 }),
    );
    // Cluster skipped wholesale; void emits.
    expect(markers.map((m) => m.id)).toEqual(['v1']);
  });

  it('a mid-fade category emits alpha-scaled descriptors (not skipped)', () => {
    const state = makeState();
    state.store.setGroup('anchors', [rec('c1', 'galaxy-cluster', { significance: 0 })]);
    const base = produceStructureMarkers(state.store, state, makeCtx(), ONE).find(
      (m) => m.id === 'c1',
    )!;
    const half = produceStructureMarkers(
      state.store,
      state,
      makeCtx(),
      handed(1, { 'galaxy-cluster': 0.5 }),
    ).find((m) => m.id === 'c1')!;
    // Still emitted (alignment) and ring/halo alpha exactly halved.
    expect(half.ringColor[3]).toBeCloseTo(base.ringColor[3] * 0.5, 6);
    expect(half.haloColor[3]).toBeCloseTo(base.haloColor[3] * 0.5, 6);
  });

  it('applies significance weight to alpha and brightens the selected ring colour', () => {
    // significance 0 → sigWeight 0.25. Selection is a colour gain, so it shows
    // on a ring whose alpha is already at its ceiling. No focus (blend 0).
    const sel = makeState('a', 'a'); // 'a' selected AND focused
    sel.store.setGroup('anchors', [
      rec('a', 'galaxy-cluster', { significance: 0 }),
      rec('b', 'galaxy-cluster', { significance: 0 }),
    ]);
    const markers = produceStructureMarkers(sel.store, sel, makeCtx(), ONE);
    const a = markers.find((m) => m.id === 'a')!;
    const b = markers.find((m) => m.id === 'b')!;
    // alpha = ringColor.a(1) × fade(1) × sigWeight(0.25), selected or not
    expect(a.ringColor[3]).toBeCloseTo(0.25, 6);
    expect(b.ringColor[3]).toBeCloseTo(0.25, 6);
    expect(a.ringColor[0]).toBeCloseTo(b.ringColor[0] * SELECTED_RING_BRIGHTEN, 6);
    expect(a.ringColor[2]).toBeCloseTo(b.ringColor[2] * SELECTED_RING_BRIGHTEN, 6);
  });

  it('a ring recedes once unless it is the focus', () => {
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('a'),
      rec('b', 'galaxy-cluster', { worldPos: [0, 10, 0] }),
    ]);
    const focusWord = structurePickId(
      'galaxy-cluster',
      state.store.categoryIndexOf('galaxy-cluster', 'a'),
    );
    const byId = (ctx: FrameView) =>
      new Map(produceStructureMarkers(state.store, state, ctx, ONE).map((m) => [m.id, m]));
    const rest = byId(makeCtx());
    const focused = byId(makeCtx(1, FULL_BAND_CAM_Z, focusWord));
    expect(focused.get('a')!.ringColor[3]).toBeCloseTo(rest.get('a')!.ringColor[3], 6);
    expect(focused.get('a')!.haloColor[3]).toBeCloseTo(rest.get('a')!.haloColor[3], 6);
    expect(focused.get('b')!.ringColor[3]).toBeCloseTo(
      rest.get('b')!.ringColor[3] * MILD_RECESSION,
      6,
    );
    expect(focused.get('b')!.haloColor[3]).toBeCloseTo(
      rest.get('b')!.haloColor[3] * MILD_RECESSION,
      6,
    );
  });

  // Behaviour change #5: selection brightens, it no longer exempts from recession.
  it('a selected ring that is not the focus recedes', () => {
    const state = makeState('b', 'a');
    state.store.setGroup('anchors', [
      rec('a', 'galaxy-cluster', { significance: 0 }),
      rec('b', 'galaxy-cluster', { significance: 0, worldPos: [0, 10, 0] }),
    ]);
    const focusWord = structurePickId(
      'galaxy-cluster',
      state.store.categoryIndexOf('galaxy-cluster', 'a'),
    );
    const b = (ctx: FrameView) =>
      produceStructureMarkers(state.store, state, ctx, ONE).find((m) => m.id === 'b')!;
    const rest = b(makeCtx());
    const focused = b(makeCtx(1, FULL_BAND_CAM_Z, focusWord));
    expect(focused.ringColor[3]).toBeCloseTo(rest.ringColor[3] * MILD_RECESSION, 6);
    expect(focused.ringColor[0]).toBeCloseTo(rest.ringColor[0], 6);
    expect(rest.ringColor[0]).toBeGreaterThan(
      STRUCTURE_MARKER_STYLES['galaxy-cluster'].ringColor[0],
    );
  });

  it('marker alpha at a camera distance equals the band value times the unbanded alpha', () => {
    const band = SCALE_FADE_BANDS.surveyDeepZoom;
    const unbanded = (() => {
      const state = makeState();
      state.store.setGroup('anchors', [rec('c1', 'galaxy-cluster', { significance: 0 })]);
      return produceStructureMarkers(state.store, state, makeCtx(0, band.fullAt * 1.01), ONE)[0]!;
    })();
    for (const dist of [band.fullAt * 1.01, (band.fullAt + band.goneAt) / 2, band.goneAt * 0.5]) {
      const state = makeState();
      state.store.setGroup('anchors', [rec('c1', 'galaxy-cluster', { significance: 0 })]);
      const m = produceStructureMarkers(state.store, state, makeCtx(0, dist), ONE)[0]!;
      const expected = fadeBand(band, dist);
      expect(m.ringColor[3]).toBeCloseTo(unbanded.ringColor[3] * expected, 5);
      expect(m.haloColor[3]).toBeCloseTo(unbanded.haloColor[3] * expected, 5);
    }
    expect(fadeBand(band, band.goneAt * 0.5)).toBe(0);
  });

  it('a 4 pc structure seen from 100 pc is not faded by the near guard', () => {
    // 100 pc is far outside the structure's own 4 pc radius, so the ring draws.
    const state = makeState();
    const camZ = FULL_BAND_CAM_Z;
    state.store.setGroup('anchors', [
      rec('tiny', 'galaxy-cluster', {
        worldPos: [0, 0, camZ - 1e-4],
        physicalRadiusMpc: 4e-6,
        significance: 1,
      }),
    ]);
    const [m] = produceStructureMarkers(state.store, state, makeCtx(0, camZ), ONE);
    expect(m!.ringColor[3]).toBeGreaterThan(0);
  });

  it('a ring at the edge of its own radius keeps its max-apparent fade on a small viewport', () => {
    const state = makeState();
    const camZ = FULL_BAND_CAM_Z;
    const r = 5;
    const d = 0.99 * r;
    state.store.setGroup('anchors', [
      rec('edge', 'galaxy-cluster', {
        worldPos: [0, 0, camZ - d],
        physicalRadiusMpc: r,
        significance: 1,
      }),
    ]);
    const ctx = { ...makeCtx(0, camZ), drawPxPerRad: 900 } as FrameView;
    const [m] = produceStructureMarkers(state.store, state, ctx, ONE);
    const style = STRUCTURE_MARKER_STYLES['galaxy-cluster'];
    const t = Math.min(
      1,
      ((r / d) * 900 - style.markerMaxApparentRadiusPx) / style.markerMaxApparentFadeBandPx,
    );
    const expected = 1 - t * t * (3 - 2 * t);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
    expect(m!.ringColor[3]).toBeCloseTo(style.ringColor[3] * expected, 5);
  });

  it('outside the focused sphere a ring draws but is not pickable; inside and at rest it is', () => {
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('in', 'galaxy-cluster', { worldPos: [10, 0, 0] }),
      rec('out', 'galaxy-cluster', { worldPos: [0, 10, 0] }),
    ]);
    const focus = {
      center: [10, 0, 0],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    } as const;
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;

    expect(produceStructureMarkers(state.store, state, ctx, ONE).map((m) => m.pickable)).toEqual([
      true,
      true,
    ]);

    const under = produceStructureMarkers(state.store, state, focused, ONE);
    // Both descriptors stay, in order: the pick decodes by per-category index.
    expect(under.map((m) => [m.id, m.pickable])).toEqual([
      ['in', true],
      ['out', false],
    ]);
  });

  it('a ring drawn below RING_PICK_MIN_ALPHA stays emitted but is not pickable', () => {
    const at = (value: number) => {
      const state = makeState();
      state.store.setGroup('anchors', [rec('a')]);
      return produceStructureMarkers(state.store, state, makeCtx(), handed(value))[0]!;
    };
    const faint = at(RING_PICK_MIN_ALPHA / 2);
    const solid = at(0.5);
    expect(faint.ringColor[3]).toBeGreaterThan(0);
    expect(faint.ringColor[3]).toBeLessThan(RING_PICK_MIN_ALPHA);
    expect(faint.pickable).toBe(false);
    expect(solid.ringColor[3]).toBeGreaterThanOrEqual(RING_PICK_MIN_ALPHA);
    expect(solid.pickable).toBe(true);
  });

  it('a hovered ring is brightened by HOVERED_RING_BRIGHTEN; a ring both hovered and selected by SELECTED_RING_BRIGHTEN', () => {
    const hoverOn = (state: TestState, id: string) => {
      state.selection = { ...state.selection, hover: { type: 'structure', id } };
      return state;
    };
    const build = (state: TestState) => {
      state.store.setGroup('anchors', [
        rec('a', 'galaxy-cluster', { significance: 0 }),
        rec('b', 'galaxy-cluster', { significance: 0 }),
      ]);
      return produceStructureMarkers(state.store, state, makeCtx(), ONE);
    };
    const plain = build(makeState()).find((m) => m.id === 'a')!;

    const hovered = build(hoverOn(makeState(), 'a')).find((m) => m.id === 'a')!;
    expect(hovered.ringColor[0]).toBeCloseTo(plain.ringColor[0] * HOVERED_RING_BRIGHTEN, 6);
    expect(hovered.ringColor[3]).toBeCloseTo(plain.ringColor[3], 6);
    // The neighbour is untouched.
    const other = build(hoverOn(makeState(), 'a')).find((m) => m.id === 'b')!;
    expect(other.ringColor[0]).toBeCloseTo(plain.ringColor[0], 6);

    const both = build(hoverOn(makeState('a', 'a'), 'a')).find((m) => m.id === 'a')!;
    expect(both.ringColor[0]).toBeCloseTo(plain.ringColor[0] * SELECTED_RING_BRIGHTEN, 6);
  });
});
