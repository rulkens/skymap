import { describe, it, expect, vi } from 'vitest';
import { near0SelectionRingLayer } from '../../../../../src/services/engine/frame/passes/near0SelectionRingLayer';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';

// The enable gate never touches ctx — a bare cast stands in for the frame ctx.
const CTX = {} as unknown as ReadyFrameContext;

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
};

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
  } as unknown as EngineState;
}

describe('near0SelectionRingLayer.enabled', () => {
  it('is true when a star row is selected and the renderer is present', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(STAR_ROW), CTX)).toBe(true);
  });

  it('is false when the renderer is null (pre-bootstrap)', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(STAR_ROW, null), CTX)).toBe(false);
  });

  it('is false when nothing is selected', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(null), CTX)).toBe(false);
  });

  it('is false for a structure row (the marker pass owns that halo)', () => {
    expect(near0SelectionRingLayer.enabled(stateWith(STRUCTURE_ROW as SelectionRow), CTX)).toBe(
      false,
    );
  });
});
