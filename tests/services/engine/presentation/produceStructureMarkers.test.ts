import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';
import { produceStructureMarkers } from '../../../../src/services/engine/presentation/produceStructureMarkers';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';

// Builds a real engineData store (so state.data.structures is the production
// store) plus a selection stub whose selected()/focused() drive the ring
// bump + focus dim, then drives the producer.
function makeState(
  selectedPoiId: string | null = null,
  focusedPoiId: string | null = selectedPoiId,
): EngineState {
  return {
    data: createEngineData(),
    subsystems: {
      selection: {
        selected: () => (selectedPoiId !== null ? { kind: 'poi', id: selectedPoiId } : null),
        focused: () => (focusedPoiId !== null ? { kind: 'poi', id: focusedPoiId } : null),
      },
    },
  } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    vp: mat4.create(),
  } as unknown as ReadyFrameContext;
}

const rec = (
  id: string,
  category: StructureRecord['category'] = 'cluster',
  over: Partial<StructureRecord> = {},
): StructureRecord =>
  ({
    id,
    name: id,
    worldPos: [10, 0, 0],
    category,
    featured: true,
    physicalRadiusMpc: 5,
    ...over,
  }) as StructureRecord;

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

  it('hides a whole category when its marker axis is off', () => {
    const state = makeState();
    state.data.structures.setGroup('bulk', [rec('c1', 'cluster'), rec('v1', 'void')]);
    state.data.structures.setMarkerVisible('cluster', false);
    const markers = produceStructureMarkers(state, makeCtx());
    expect(markers.map((m) => m.id)).toEqual(['v1']);
  });

  it('applies significance weight, selection 1.5x bump, and focus dim', () => {
    // significance 0 → sigWeight 0.25, so the base ring alpha is well under 1
    // and the ×1.5 selection bump / focus dim are observable.
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
    // b is non-focused while 'a' is focused → 0.25 × dim(0.25) = 0.0625
    expect(b.ringColor[3]).toBeCloseTo(0.0625, 6);
  });
});
