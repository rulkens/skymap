import { describe, expect, it } from 'vitest';
import { produceStructureLabels } from '../../../../src/services/engine/presentation/produceStructureLabels';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';

// produceStructureLabels reads only state.data.structures (no selection / no
// projection — declutter moved to the director), so a bare engineData stub
// suffices.
function makeState(): EngineState {
  return { data: createEngineData() } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as ReadyFrameContext;
}

const rec = (id: string, over: Partial<StructureRecord> = {}): StructureRecord =>
  ({
    id,
    name: id,
    worldPos: [10, 0, 0],
    category: 'cluster',
    featured: true,
    physicalRadiusMpc: 5,
    ...over,
  }) as StructureRecord;

describe('produceStructureLabels', () => {
  it('emits a label only for featured structures', () => {
    const state = makeState();
    state.data.structures.setGroup('bulk', [rec('a'), rec('b', { featured: false })]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['a']);
  });

  it('hides labels for a category whose label axis is off', () => {
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    state.data.structures.setLabelVisible('cluster', false);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('hides a structure label when its marker (ring anchor) is hidden', () => {
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('c1', { category: 'cluster' })]);
    state.data.structures.setMarkerVisible('cluster', false);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('sets prominencePx to the ring apparent radius and never declutters', () => {
    // Two featured structures at the same position → both labels emitted
    // (no internal declutter; the director de-collides later). Their
    // prominencePx equals the ring apparent radius.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('a'), rec('b')]);
    const out = produceStructureLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['a', 'b']);
    // radius 5 Mpc / 10 Mpc distance × pxPerRad (= halfH/tan(fovY/2) = 540/tan(30°))
    const pxPerRad = 540 / Math.tan((30 * Math.PI) / 180);
    const expected = (5 / 10) * pxPerRad;
    expect(out.labels[0]!.prominencePx).toBeCloseTo(expected, 3);
  });

  it('fades the label out as the ring grows past the close-approach band', () => {
    // Camera very close → apparent radius far past markerMaxApparentRadiusPx
    // (700 + 400 band) → fully faded → label dropped entirely.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('huge', { worldPos: [0.1, 0, 0] })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('fades the label out below the far-distance floor', () => {
    // Tiny apparent radius (far away, below markerMinApparentRadiusPx=5) →
    // minFadeOut 0 → dropped.
    const state = makeState();
    state.data.structures.setGroup('anchors', [rec('far', { worldPos: [100000, 0, 0] })]);
    expect(produceStructureLabels(state, makeCtx()).labels).toEqual([]);
  });
});
