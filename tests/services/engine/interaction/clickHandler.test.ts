/**
 * clickHandler — unit tests for the click → Selection resolver.
 *
 * The resolver is a small async wrapper around `pickRenderer.pick` that
 * delegates the decode to `pickToSelection` (covered exhaustively in
 * `pickToSelection.test.ts`). These tests verify the wrapper itself:
 *
 *   1. A picker miss (`null`) returns null.
 *   2. A survey hit returns its galaxy `Selection`.
 *   3. A structure hit resolves through the injected store to its id.
 *   4. The picker is called with the exact (viewport, x, y, sources)
 *      values supplied by the engine — no transformation.
 */

import { describe, it, expect, vi } from 'vitest';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import type { PickStructureStore } from '../../../../src/@types/engine/data/PickStructureStore';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
import { Source } from '../../../../src/data/sources';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import type { PickResult } from '../../../../src/data/selectionEncoding';

type PickRenderer = ReturnType<typeof createPickRenderer>;

// `pickRenderer.pick` returns the decoded `PickResult` (sourceCode + localIdx).
function makePicker(pick: PickResult | null): PickRenderer {
  return {
    pick: vi.fn(async () => pick),
    destroy: vi.fn(),
  } as unknown as PickRenderer;
}

const virgo: StructureRecord = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const structures: PickStructureStore = {
  byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
};

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
  viewportPx: [800, 600],
  visibleSources: [],
};

describe('createClickResolver', () => {
  it('returns null when the picker reports background (null)', async () => {
    const r = createClickResolver({ pickRenderer: makePicker(null), structures });
    expect(await r.resolveClick(dummyArgs)).toBeNull();
  });

  it('returns a galaxy Selection on a survey hit', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker({ sourceCode: Source.SDSS, localIdx: 7 }),
      structures,
    });
    expect(await r.resolveClick(dummyArgs)).toEqual({
      kind: 'galaxy',
      source: Source.SDSS,
      localIdx: 7,
    });
  });

  it('resolves a structure hit through the store to a structure Selection', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker({ sourceCode: Source.Cluster, localIdx: 0 }),
      structures,
    });
    expect(await r.resolveClick(dummyArgs)).toEqual({ kind: 'structure', id: virgo.id });
  });

  it('forwards the click args to pickRenderer.pick verbatim', async () => {
    const picker = makePicker({ sourceCode: Source.SDSS, localIdx: 0 });
    const r = createClickResolver({ pickRenderer: picker, structures });
    const sources: ClickResolveInput['visibleSources'] = [];
    await r.resolveClick({
      pickXPx: 11,
      pickYPx: 22,
      viewportPx: [1280, 720],
      visibleSources: sources,
    });
    expect(picker.pick).toHaveBeenCalledTimes(1);
    // 5th arg is `pointSizePx` (undefined when unsupplied — no pick-floor
    // boost); 6th is the optional `timingDescriptor` (undefined when the
    // timing service is absent — see PickRenderer JSDoc).
    expect(picker.pick).toHaveBeenCalledWith([1280, 720], 11, 22, sources, undefined, undefined);
  });
});
