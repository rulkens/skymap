import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, expect, it, vi } from 'vitest';
import type { ClipPlayer } from '../../../../src/@types/engine/subsystems/ClipPlayer';
import { mat4 } from 'wgpu-matrix';
import { produceStructureMarkers } from '../../../../src/services/engine/presentation/produceStructureMarkers';
import { MARKER_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import type { FadeRegistry } from '../../../../src/@types/animation/FadeRegistry';

function makeRegistry(): FadeRegistry {
  return createFadeRegistry({ requestRender: () => {} });
}
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import {
  STRUCTURE_MARKER_STYLES,
  SELECTED_RING_BRIGHTEN,
} from '../../../../src/services/engine/presentation/structureMarkerStyles';
import { fadeBand } from '../../../../src/utils/math/fadeBand';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';

// Builds a real engineData store (so state.data.structures is the production
// store) + a real FadeRegistry (so per-category marker opacity comes from the
// production fail-safe path: unregistered markerLayer handles read 1.0) +
// state.selection refs that drive the ring bump + recession +
// a settings.structures.items bag (the authoritative per-category gate, all
// enabled by default), then drives the producer. The registry is returned on
// the state so a test can register/seed a structure handle to exercise the
// toggle path.
type TestState = EngineState & { subsystems: { fades: FadeRegistry } };

// All-enabled structure items bag — the authoritative ring/label gate the
// producer reads. Tests flip an entry to false to drive the disabled path.
function makeStructureItems(): EngineState['settings']['structures']['items'] {
  return Object.fromEntries(
    STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
  ) as EngineState['settings']['structures']['items'];
}

function makeState(
  selectedStructureId: string | null = null,
  focusedStructureId: string | null = selectedStructureId,
): TestState {
  return {
    data: createEngineData(),
    settings: { structures: { enabled: true, items: makeStructureItems() } },
    selection: {
      select: selectedStructureId !== null ? { type: 'structure', id: selectedStructureId } : null,
      focus: focusedStructureId !== null ? { type: 'structure', id: focusedStructureId } : null,
      hover: null,
    },
    subsystems: {
      fades: makeRegistry(),
      // clipPlayer is non-nullable; return factor 1 so the clip channel is
      // behaviour-neutral and existing assertions are unaffected.
      clipPlayer: {
        tick: vi.fn<ClipPlayer['tick']>((clipEpoch) => ({ clipEpoch })),
        stop: vi.fn<() => void>(),
        clipOpacityOf: vi.fn<(layer: string, nowMs: number) => number>(() => 1),
        destroy: vi.fn<() => void>(),
      },
    },
  } as unknown as TestState;
}

// Past the surveyDeepZoom band's full edge, so the visibility band is 1 and
// the structures sit ~10 Mpc away to within 0.01%.
const FULL_BAND_CAM_Z = SCALE_FADE_BANDS.surveyDeepZoom.fullAt * 1.01;

function makeCtx(focusBlend = 0, camDistMpc = FULL_BAND_CAM_Z): FrameView {
  return {
    snapshot: { focusBlend, nowMs: 0, focus: ZERO_FOCUS },
    drawCamPos: [0, 0, camDistMpc],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    vp: mat4.identity(),
  } as unknown as FrameView;
}

const rec = (
  id: string,
  category: StructureInfo['category'] = 'cluster',
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
    state.data.structures.setGroup('bulk', [rec('b1'), rec('b2')]);
    state.data.structures.setGroup('anchors', [rec('a1')]);
    const markers = produceStructureMarkers(state, makeCtx());
    expect(markers.map((m) => m.id)).toEqual(['a1', 'b1', 'b2']);
  });

  it('emits an alpha-0 descriptor for a fully-faded (far) structure (pick-index alignment)', () => {
    const state = makeState();
    // Near structure (visible) + far structure (apparent radius below the min
    // floor → faded). Both MUST emit so the per-category index stays aligned.
    state.data.structures.setGroup('bulk', [
      rec('near'),
      rec('far', 'cluster', { worldPos: [10000, 0, 0] }),
    ]);
    const markers = produceStructureMarkers(state, makeCtx());
    expect(markers.map((m) => m.id)).toEqual(['near', 'far']);
    const far = markers.find((m) => m.id === 'far')!;
    expect(far.ringColor[3]).toBe(0);
    expect(far.haloColor[3]).toBe(0);
  });

  it('skips a category that is disabled AND fully faded (opacity 0)', () => {
    const state = makeState();
    state.data.structures.setGroup('bulk', [rec('c1', 'cluster'), rec('v1', 'void')]);
    // Both halves of the all-or-nothing skip: the authoritative `enabled`
    // boolean is false AND the structure fade has reached 0.
    state.settings.structures.items.cluster.enabled = false;
    state.subsystems.fades.register({ kind: 'structure', id: 'cluster' }, 1);
    state.subsystems.fades.setImmediate({ kind: 'structure', id: 'cluster' }, 0);
    const markers = produceStructureMarkers(state, makeCtx());
    // Cluster skipped wholesale; void (enabled, unregistered → fail-safe 1.0) emits.
    expect(markers.map((m) => m.id)).toEqual(['v1']);
  });

  it('draws a disabled category whose structure opacity is still > 0 (fade-out tail)', () => {
    const state = makeState();
    state.data.structures.setGroup('bulk', [rec('c1', 'cluster', { significance: 0 })]);
    // Authoritative gate is OFF but the fade hasn't reached 0 yet: the fade-out
    // tail must still emit alpha-scaled descriptors, NOT skip.
    state.settings.structures.items.cluster.enabled = false;
    state.subsystems.fades.register({ kind: 'structure', id: 'cluster' }, 1);
    state.subsystems.fades.setImmediate({ kind: 'structure', id: 'cluster' }, 0.5);
    const markers = produceStructureMarkers(state, makeCtx());
    const c1 = markers.find((m) => m.id === 'c1')!;
    // Emitted, with alpha scaled by the 0.5 fade opacity (× sigWeight 0.25).
    expect(c1.ringColor[3]).toBeCloseTo(1 * 0.25 * 0.5, 6);
  });

  it('a mid-fade category emits alpha-scaled descriptors (not skipped)', () => {
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('c1', 'cluster', { significance: 0 })]);
    // No-focus baseline alpha first (cluster handle unregistered → 1.0).
    const baseMarkers = produceStructureMarkers(state, makeCtx());
    const base = baseMarkers.find((m) => m.id === 'c1')!;
    // Now half-fade the cluster category.
    state.subsystems.fades.register({ kind: 'structure', id: 'cluster' }, 1);
    state.subsystems.fades.setImmediate({ kind: 'structure', id: 'cluster' }, 0.5);
    const markers = produceStructureMarkers(state, makeCtx());
    const half = markers.find((m) => m.id === 'c1')!;
    // Still emitted (alignment) and ring/halo alpha exactly halved.
    expect(half.ringColor[3]).toBeCloseTo(base.ringColor[3] * 0.5, 6);
    expect(half.haloColor[3]).toBeCloseTo(base.haloColor[3] * 0.5, 6);
  });

  it('applies significance weight to alpha and brightens the selected ring colour', () => {
    // significance 0 → sigWeight 0.25. Selection is a colour gain, so it shows
    // on a ring whose alpha is already at its ceiling. No focus (blend 0).
    const sel = makeState('a', 'a'); // 'a' selected AND focused
    sel.data.structures.setGroup('anchors', [
      rec('a', 'cluster', { significance: 0 }),
      rec('b', 'cluster', { significance: 0 }),
    ]);
    const markers = produceStructureMarkers(sel, makeCtx());
    const a = markers.find((m) => m.id === 'a')!;
    const b = markers.find((m) => m.id === 'b')!;
    // alpha = ringColor.a(1) × fade(1) × sigWeight(0.25), selected or not
    expect(a.ringColor[3]).toBeCloseTo(0.25, 6);
    expect(b.ringColor[3]).toBeCloseTo(0.25, 6);
    expect(a.ringColor[0]).toBeCloseTo(b.ringColor[0] * SELECTED_RING_BRIGHTEN, 6);
    expect(a.ringColor[2]).toBeCloseTo(b.ringColor[2] * SELECTED_RING_BRIGHTEN, 6);
  });

  it('non-focused marker ring AND halo alpha scale by focusRecession at blend > 0', () => {
    const state = makeState('a', 'a'); // 'a' focused
    state.data.structures.setGroup('anchors', [rec('a', 'cluster'), rec('b', 'cluster')]);
    const rest = produceStructureMarkers(state, makeCtx(0));
    const focused = produceStructureMarkers(state, makeCtx(1));
    const bRest = rest.find((m) => m.id === 'b')!;
    const bFoc = focused.find((m) => m.id === 'b')!;
    // Non-focused 'b' recedes to MARKER_RECESSION of its at-rest alpha at blend 1.
    expect(bFoc.ringColor[3]).toBeCloseTo(bRest.ringColor[3] * MARKER_RECESSION, 6);
    expect(bFoc.haloColor[3]).toBeCloseTo(bRest.haloColor[3] * MARKER_RECESSION, 6);
  });

  it('focused marker is exempt from recession', () => {
    const state = makeState('a', 'a'); // 'a' focused
    state.data.structures.setGroup('anchors', [rec('a', 'cluster'), rec('b', 'cluster')]);
    const rest = produceStructureMarkers(state, makeCtx(0));
    const focused = produceStructureMarkers(state, makeCtx(1));
    const aRest = rest.find((m) => m.id === 'a')!;
    const aFoc = focused.find((m) => m.id === 'a')!;
    // The focused structure's ring/halo are unchanged across the blend.
    expect(aFoc.ringColor[3]).toBeCloseTo(aRest.ringColor[3], 6);
    expect(aFoc.haloColor[3]).toBeCloseTo(aRest.haloColor[3], 6);
  });

  it('marker alpha at a camera distance equals the band value times the unbanded alpha', () => {
    const band = SCALE_FADE_BANDS.surveyDeepZoom;
    const unbanded = (() => {
      const state = makeState();
      state.data.structures.setGroup('anchors', [rec('c1', 'cluster', { significance: 0 })]);
      return produceStructureMarkers(state, makeCtx(0, band.fullAt * 1.01))[0]!;
    })();
    for (const dist of [band.fullAt * 1.01, (band.fullAt + band.goneAt) / 2, band.goneAt * 0.5]) {
      const state = makeState();
      state.data.structures.setGroup('anchors', [rec('c1', 'cluster', { significance: 0 })]);
      const m = produceStructureMarkers(state, makeCtx(0, dist))[0]!;
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
    state.data.structures.setGroup('anchors', [
      rec('tiny', 'cluster', {
        worldPos: [0, 0, camZ - 1e-4],
        physicalRadiusMpc: 4e-6,
        significance: 1,
      }),
    ]);
    const [m] = produceStructureMarkers(state, makeCtx(0, camZ));
    expect(m!.ringColor[3]).toBeGreaterThan(0);
  });

  it('a ring at the edge of its own radius keeps its max-apparent fade on a small viewport', () => {
    const state = makeState();
    const camZ = FULL_BAND_CAM_Z;
    const r = 5;
    const d = 0.99 * r;
    state.data.structures.setGroup('anchors', [
      rec('edge', 'cluster', { worldPos: [0, 0, camZ - d], physicalRadiusMpc: r, significance: 1 }),
    ]);
    const ctx = { ...makeCtx(0, camZ), drawPxPerRad: 900 } as FrameView;
    const [m] = produceStructureMarkers(state, ctx);
    const style = STRUCTURE_MARKER_STYLES.cluster;
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
    state.data.structures.setGroup('anchors', [
      rec('in', 'cluster', { worldPos: [10, 0, 0] }),
      rec('out', 'cluster', { worldPos: [0, 10, 0] }),
    ]);
    const focus = {
      center: [10, 0, 0],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    } as const;
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;

    expect(produceStructureMarkers(state, ctx).map((m) => m.pickable)).toEqual([true, true]);

    const under = produceStructureMarkers(state, focused);
    // Both descriptors stay, in order: the pick decodes by per-category index.
    expect(under.map((m) => [m.id, m.pickable])).toEqual([
      ['in', true],
      ['out', false],
    ]);
  });
});
