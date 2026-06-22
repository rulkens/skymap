/**
 * clickHandler — unit tests for the click → SelectionRef resolver.
 *
 * The resolver is a small async wrapper around `pickRenderer.pick` that
 * delegates decode + resolution to `resolvePick` (covered exhaustively in
 * `resolvePick.test.ts`). These tests verify the wrapper itself:
 *
 *   1. A picker miss (`null`) returns null.
 *   2. A galaxy catalog hit resolves to a `{ type:'galaxyCatalog', source, index }` ref.
 *   3. A structure hit resolves to a `{ type:'structure', id }` ref.
 *   4. The picker is called with the exact (viewport, x, y, sources, pointSizePx,
 *      uniformBytes) values supplied by the engine — no transformation.
 *   5. `uniformBytes` is threaded verbatim into `pickRenderer.pick`.
 */

import { describe, it, expect, vi } from 'vitest';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import type { PickStructureStore } from '../../../../src/@types/engine/data/PickStructureStore';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import type { PickResult } from '../../../../src/@types/data/PickResult';

type PickRenderer = ReturnType<typeof createPickRenderer>;

// `pickRenderer.pick` returns the decoded `PickResult` (sourceCode + localIdx).
function makePicker(pick: PickResult | null): PickRenderer {
  return {
    pick: vi.fn(async () => pick),
    destroy: vi.fn(),
  } as unknown as PickRenderer;
}

const virgo: StructureInfo = {
  type: 'structure',
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

// The only dep `resolvePick` needs — the galaxy arm is purely positional
// (no cloud read), so only the structure store is required.
const deps = {
  structures,
};

// A dummy uniform bytes buffer — the click resolver passes it verbatim to
// the pick renderer without reading its contents.
const dummyUniformBytes = new ArrayBuffer(176);

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
  viewportPx: [800, 600],
  visibleSources: [],
  uniformBytes: dummyUniformBytes,
};

describe('createClickResolver', () => {
  it('returns null when the picker reports background (null)', async () => {
    const r = createClickResolver({ pickRenderer: makePicker(null), ...deps });
    expect(await r.resolveClick(dummyArgs)).toBeNull();
  });

  it('resolves a galaxy catalog hit to a galaxy ref', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker({ sourceCode: Source.SDSS, localIdx: 7 }),
      ...deps,
    });
    const target = await r.resolveClick(dummyArgs);
    expect(target).not.toBeNull();
    expect(target?.type).toBe('galaxyCatalog');
    if (target?.type === 'galaxyCatalog') {
      expect(target.source).toBe(Source.SDSS);
      expect(target.index).toBe(7);
    }
  });

  it('resolves a structure hit to its structure ref', async () => {
    // `resolvePick` converts the pick index to the durable record id via
    // `structures.byCategory`; the resolver returns the ref, not the full
    // StructureInfo object.
    const r = createClickResolver({
      pickRenderer: makePicker({ sourceCode: Source.Cluster, localIdx: 0 }),
      ...deps,
    });
    expect(await r.resolveClick(dummyArgs)).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('forwards the click args to pickRenderer.pick verbatim', async () => {
    const picker = makePicker({ sourceCode: Source.SDSS, localIdx: 0 });
    const r = createClickResolver({ pickRenderer: picker, ...deps });
    const sources: ClickResolveInput['visibleSources'] = [];
    const uniformBytes = new ArrayBuffer(176);
    await r.resolveClick({
      pickXPx: 11,
      pickYPx: 22,
      viewportPx: [1280, 720],
      visibleSources: sources,
      uniformBytes,
    });
    expect(picker.pick).toHaveBeenCalledTimes(1);
    // Args in order: viewportPx, pickXPx, pickYPx, visibleSources,
    // pointSizePx (defaults to 2.5 when not in ClickResolveInput),
    // uniformBytes, timingDescriptor (undefined when absent).
    expect(picker.pick).toHaveBeenCalledWith(
      [1280, 720],
      11,
      22,
      sources,
      2.5,
      uniformBytes,
      undefined,
    );
  });

  it('threads uniformBytes into pickRenderer.pick — the pick renderer receives the exact buffer', async () => {
    // This test proves the click resolver is a correct conduit for the
    // last-frame uniform bytes: the buffer object identity is preserved
    // through resolveClick → pick, so the pick renderer uploads exactly
    // what the visual frame packed.
    const picker = makePicker(null);
    const r = createClickResolver({ pickRenderer: picker, ...deps });

    const specificUniformBytes = new ArrayBuffer(176);
    await r.resolveClick({
      pickXPx: 5,
      pickYPx: 5,
      viewportPx: [800, 600],
      visibleSources: [],
      uniformBytes: specificUniformBytes,
    });

    expect(picker.pick).toHaveBeenCalledTimes(1);
    // The 6th arg (index 5) must be the exact same ArrayBuffer reference.
    const callArgs = (picker.pick as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(callArgs[5]).toBe(specificUniformBytes);
  });

  it('threads pointSizePx into pickRenderer.pick when provided', async () => {
    const picker = makePicker(null);
    const r = createClickResolver({ pickRenderer: picker, ...deps });

    await r.resolveClick({
      pickXPx: 5,
      pickYPx: 5,
      viewportPx: [800, 600],
      visibleSources: [],
      uniformBytes: dummyUniformBytes,
      pointSizePx: 5.0,
    });

    const callArgs = (picker.pick as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(callArgs[4]).toBe(5.0);
  });
});
