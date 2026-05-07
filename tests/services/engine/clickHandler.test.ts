/**
 * clickHandler — unit tests for the click → selection-index resolver.
 *
 * The resolver is a small async wrapper around `pickRenderer.pick`
 * plus the engine's `resolveGlobalIdx` / `buildPointInfo` hooks.  We
 * stub all three and verify:
 *
 *   1. A picker miss (`idx === -1`) returns `{ kind: 'clear' }`.
 *   2. A picker hit with successful PointInfo build returns the
 *      `{ kind: 'select', globalIdx, info }` shape.
 *   3. A picker hit but `resolveGlobalIdx` returns null still selects
 *      the index (info: null) — preserves pre-extraction behaviour.
 *   4. A picker hit but `buildPointInfo` returns null still selects
 *      the index (info: null) — same parity rule.
 *   5. The picker is called with the exact (viewport, x, y, sources)
 *      values supplied by the engine — no transformation.  The shared
 *      uniform buffer is no longer threaded through the resolver: the
 *      pick renderer reads it from its bound PointRenderer instead, so
 *      the resolver's surface is one less arg wide.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  createClickResolver,
  type ClickResolveInput,
} from '../../../src/services/engine/clickHandler';
import { Source } from '../../../src/data/sources';
import type { PointCloud, PointInfo } from '../../../src/@types';
import type { createPickRenderer } from '../../../src/services/gpu/pickRenderer';

type PickRenderer = ReturnType<typeof createPickRenderer>;

function makePicker(idx: number): PickRenderer {
  return {
    pick: vi.fn(async () => idx),
    destroy: vi.fn(),
  } as unknown as PickRenderer;
}

const dummyCloud: PointCloud = {} as PointCloud;
const dummyInfo = { iauName: 'Galaxy 7' } as unknown as PointInfo;

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
  viewportPx: [800, 600],
  visibleSources: [],
};

describe('createClickResolver', () => {
  it('returns kind="clear" when the picker reports background (-1)', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker(-1),
      resolveGlobalIdx: () => ({ source: Source.SDSS, localIdx: 0, cloud: dummyCloud }),
      buildPointInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'clear' });
  });

  it('returns kind="select" with globalIdx + info on a successful hit', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker(42),
      resolveGlobalIdx: () => ({ source: Source.SDSS, localIdx: 7, cloud: dummyCloud }),
      buildPointInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', globalIdx: 42, info: dummyInfo });
  });

  it('returns kind="select" with info=null when resolveGlobalIdx returns null', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker(99),
      resolveGlobalIdx: () => null,
      buildPointInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', globalIdx: 99, info: null });
  });

  it('returns kind="select" with info=null when buildPointInfo returns null', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker(123),
      resolveGlobalIdx: () => ({ source: Source.SDSS, localIdx: 4, cloud: dummyCloud }),
      buildPointInfo: () => null,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', globalIdx: 123, info: null });
  });

  it('forwards the click args to pickRenderer.pick verbatim', async () => {
    const picker = makePicker(0);
    const r = createClickResolver({
      pickRenderer: picker,
      resolveGlobalIdx: () => ({ source: Source.SDSS, localIdx: 0, cloud: dummyCloud }),
      buildPointInfo: () => dummyInfo,
    });
    const sources: ClickResolveInput['visibleSources'] = [];
    await r.resolveClick({
      pickXPx: 11,
      pickYPx: 22,
      viewportPx: [1280, 720],
      visibleSources: sources,
    });
    expect(picker.pick).toHaveBeenCalledTimes(1);
    // The 5th arg is `pointSizePx` — undefined when the caller didn't
    // supply it, which preserves the legacy "no pick-floor boost"
    // behaviour for tests that aren't exercising that path.  The
    // shared uniform buffer is no longer threaded through here; the
    // pick renderer reads it from its bound PointRenderer (Phase 3 of
    // the engine-renderer-boundaries plan).
    expect(picker.pick).toHaveBeenCalledWith([1280, 720], 11, 22, sources, undefined);
  });

  it('forwards the resolveGlobalIdx triple into buildPointInfo unchanged', async () => {
    const buildPointInfo = vi.fn(() => dummyInfo);
    const r = createClickResolver({
      pickRenderer: makePicker(8),
      resolveGlobalIdx: () => ({ source: Source.TwoMRS, localIdx: 13, cloud: dummyCloud }),
      buildPointInfo,
    });
    await r.resolveClick(dummyArgs);
    expect(buildPointInfo).toHaveBeenCalledTimes(1);
    expect(buildPointInfo).toHaveBeenCalledWith(dummyCloud, 13, Source.TwoMRS);
  });
});
