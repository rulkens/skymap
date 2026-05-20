/**
 * clickHandler — unit tests for the click → selection resolver.
 *
 * The resolver is a small async wrapper around `pickRenderer.pick`
 * plus the engine's `resolveSelection` / `buildGalaxyInfo` hooks.  We
 * stub all three and verify:
 *
 *   1. A picker miss (`null`) returns `{ kind: 'clear' }`.
 *   2. A picker hit with successful GalaxyInfo build returns the
 *      `{ kind: 'select', selection, info }` shape.
 *   3. A picker hit but `resolveSelection` returns null still selects
 *      (info: null) — preserves pre-extraction behaviour.
 *   4. A picker hit but `buildGalaxyInfo` returns null still selects
 *      (info: null) — same parity rule.
 *   5. The picker is called with the exact (viewport, x, y, sources)
 *      values supplied by the engine — no transformation.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SourceType } from '../../../../src/@types/data/Source';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import { Source } from '../../../../src/data/sources';
import type { GalaxyInfo } from '../../../../src/@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import type { PickResult } from '../../../../src/data/selectionEncoding';

type PickRenderer = ReturnType<typeof createPickRenderer>;

// `pickRenderer.pick` now returns the full discriminated `PickResult`
// union (galaxy | cluster | supercluster | void) post-Plan-3 Task 10.
// Helper accepts a galaxy-shaped selection for ergonomic test setup
// and wraps it into the canonical `{ kind: 'galaxy', ... }` shape.
function makePicker(result: { source: SourceType; localIdx: number } | null): PickRenderer {
  const wrapped: PickResult | null =
    result === null ? null : { kind: 'galaxy', source: result.source, localIdx: result.localIdx };
  return {
    pick: vi.fn(async () => wrapped),
    destroy: vi.fn(),
  } as unknown as PickRenderer;
}

const dummyCloud: GalaxyCatalog = {} as GalaxyCatalog;
const dummyInfo = { iauName: 'Galaxy 7' } as unknown as GalaxyInfo;

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
  viewportPx: [800, 600],
  visibleSources: [],
};

describe('createClickResolver', () => {
  it('returns kind="clear" when the picker reports background (null)', async () => {
    const r = createClickResolver({
      pickRenderer: makePicker(null),
      resolveSelection: () => ({ source: Source.SDSS, localIdx: 0, cloud: dummyCloud }),
      buildGalaxyInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'clear' });
  });

  it('returns kind="select" with selection + info on a successful hit', async () => {
    const sel = { source: Source.SDSS, localIdx: 7 };
    const r = createClickResolver({
      pickRenderer: makePicker(sel),
      resolveSelection: () => ({ source: Source.SDSS, localIdx: 7, cloud: dummyCloud }),
      buildGalaxyInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', selection: sel, info: dummyInfo });
  });

  it('returns kind="select" with info=null when resolveSelection returns null', async () => {
    const sel = { source: Source.Glade, localIdx: 99 };
    const r = createClickResolver({
      pickRenderer: makePicker(sel),
      resolveSelection: () => null,
      buildGalaxyInfo: () => dummyInfo,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', selection: sel, info: null });
  });

  it('returns kind="select" with info=null when buildGalaxyInfo returns null', async () => {
    const sel = { source: Source.SDSS, localIdx: 4 };
    const r = createClickResolver({
      pickRenderer: makePicker(sel),
      resolveSelection: () => ({ source: Source.SDSS, localIdx: 4, cloud: dummyCloud }),
      buildGalaxyInfo: () => null,
    });
    const result = await r.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'select', selection: sel, info: null });
  });

  it('forwards the click args to pickRenderer.pick verbatim', async () => {
    const picker = makePicker({ source: Source.SDSS, localIdx: 0 });
    const r = createClickResolver({
      pickRenderer: picker,
      resolveSelection: () => ({ source: Source.SDSS, localIdx: 0, cloud: dummyCloud }),
      buildGalaxyInfo: () => dummyInfo,
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
    // behaviour for tests that aren't exercising that path.  The 6th
    // arg is the optional `timingDescriptor` (likewise undefined when
    // the engine's timing service is absent — see PickRenderer JSDoc).
    expect(picker.pick).toHaveBeenCalledWith([1280, 720], 11, 22, sources, undefined, undefined);
  });

  it('forwards the resolveSelection triple into buildGalaxyInfo unchanged', async () => {
    const buildGalaxyInfo = vi.fn(() => dummyInfo);
    const r = createClickResolver({
      pickRenderer: makePicker({ source: Source.TwoMRS, localIdx: 13 }),
      resolveSelection: () => ({ source: Source.TwoMRS, localIdx: 13, cloud: dummyCloud }),
      buildGalaxyInfo,
    });
    await r.resolveClick(dummyArgs);
    expect(buildGalaxyInfo).toHaveBeenCalledTimes(1);
    expect(buildGalaxyInfo).toHaveBeenCalledWith(dummyCloud, 13, Source.TwoMRS);
  });
});
