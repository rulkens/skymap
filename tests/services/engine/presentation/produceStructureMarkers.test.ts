import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';
import { produceStructureMarkers } from '../../../../src/services/engine/presentation/produceStructureMarkers';
import { MARKER_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import type { FadeRegistry } from '../../../../src/@types/animation/FadeRegistry';

function makeRegistry(): FadeRegistry {
  return createFadeRegistry({ requestRender: () => {} });
}
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
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
    },
  } as unknown as TestState;
}

function makeCtx(focusBlend = 0): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    focusBlend,
    vp: mat4.create(),
  } as unknown as ReadyFrameContext;
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

  it('applies significance weight and selection 1.5x bump (at rest)', () => {
    // significance 0 → sigWeight 0.25, so the base ring alpha is well under 1
    // and the ×1.5 selection bump is observable. No focus (blend 0).
    const sel = makeState('a', 'a'); // 'a' selected AND focused
    sel.data.structures.setGroup('anchors', [
      rec('a', 'cluster', { significance: 0 }),
      rec('b', 'cluster', { significance: 0 }),
    ]);
    const markers = produceStructureMarkers(sel, makeCtx());
    const a = markers.find((m) => m.id === 'a')!;
    const b = markers.find((m) => m.id === 'b')!;
    // base = ringColor.a(1) × fade(1) × sigWeight(0.25) = 0.25
    // a is selected → min(1, 0.25 × 1.5) = 0.375
    expect(a.ringColor[3]).toBeCloseTo(0.375, 6);
    // b is non-focused but blend 0 → recession 1 → 0.25 × 1 = 0.25
    expect(b.ringColor[3]).toBeCloseTo(0.25, 6);
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

  it('selected ring bump is unaffected by recession', () => {
    // 'sel' is SELECTED but a DIFFERENT structure 'foc' is FOCUSED, so the
    // selected-but-not-focused ring would recede if recession leaked into the
    // selected branch. It must not: the bump stays min(1, base×1.5).
    const state = makeState('sel', 'foc');
    state.data.structures.setGroup('anchors', [
      rec('sel', 'cluster', { significance: 0 }),
      rec('foc', 'cluster', { significance: 0 }),
    ]);
    const focused = produceStructureMarkers(state, makeCtx(1));
    const sel = focused.find((m) => m.id === 'sel')!;
    // base = 1 × 1 × 0.25 = 0.25; selected → min(1, 0.25 × 1.5) = 0.375,
    // recession-free even at blend 1.
    expect(sel.ringColor[3]).toBeCloseTo(0.375, 6);
  });

  it('at-rest output is unchanged (blend 0, fail-safe toggles, no focus)', () => {
    const state = makeState();
    state.data.structures.setGroup('anchors', [
      rec('a', 'cluster', { significance: 0 }),
      rec('v', 'void', { significance: 1 }),
    ]);
    const markers = produceStructureMarkers(state, makeCtx(0));
    const a = markers.find((m) => m.id === 'a')!;
    const v = markers.find((m) => m.id === 'v')!;
    // Cluster significance 0 → sigWeight 0.25; ring at-rest alpha 1 → 0.25.
    expect(a.ringColor[3]).toBeCloseTo(0.25, 6);
    // Void significance 1 → sigWeight 1; ring tint #73B3D9 (alpha 1) → 1.
    expect(v.ringColor[3]).toBeCloseTo(1, 6);
  });
});
