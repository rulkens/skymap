/**
 * clickHandler — unit tests for the click → Selection resolver.
 *
 * The resolver is a small async wrapper around `pickRenderer.pick` that
 * decodes the hit into a `Selection` (or null). It does NOT resolve the
 * target — `setSelected` owns that — so the tests stub only the picker
 * and verify:
 *
 *   1. A picker miss (`null`) returns null.
 *   2. A galaxy hit returns `{ kind: 'galaxy', source, localIdx }`.
 *   3. The picker is called with the exact (viewport, x, y, sources)
 *      values supplied by the engine — no transformation.
 *
 * The POI arm is covered in `clickHandler.poi.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SourceType } from '../../../../src/@types/data/SourceType';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import { Source } from '../../../../src/data/sources';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';
import type { PickResult } from '../../../../src/data/selectionEncoding';

type PickRenderer = ReturnType<typeof createPickRenderer>;

// `pickRenderer.pick` returns the discriminated `PickResult` union
// (galaxy | structure category). Helper accepts a galaxy-shaped selection
// for ergonomic setup and wraps it into the `{ kind: 'galaxy', ... }` shape.
function makePicker(result: { source: SourceType; localIdx: number } | null): PickRenderer {
  const wrapped: PickResult | null =
    result === null ? null : { kind: 'galaxy', source: result.source, localIdx: result.localIdx };
  return {
    pick: vi.fn(async () => wrapped),
    destroy: vi.fn(),
  } as unknown as PickRenderer;
}

const dummyArgs: ClickResolveInput = {
  pickXPx: 10,
  pickYPx: 20,
  viewportPx: [800, 600],
  visibleSources: [],
};

describe('createClickResolver', () => {
  it('returns null when the picker reports background (null)', async () => {
    const r = createClickResolver({ pickRenderer: makePicker(null) });
    expect(await r.resolveClick(dummyArgs)).toBeNull();
  });

  it('returns a galaxy Selection on a survey hit', async () => {
    const sel = { source: Source.SDSS, localIdx: 7 };
    const r = createClickResolver({ pickRenderer: makePicker(sel) });
    expect(await r.resolveClick(dummyArgs)).toEqual({ kind: 'galaxy', ...sel });
  });

  it('returns the galaxy Selection regardless of cloud-loaded state', async () => {
    // No resolveSelection/buildGalaxyInfo to consult — the resolver always
    // hands back the (source, localIdx); setSelected tolerates an
    // unloaded cloud by firing onSelectChange(null). Parity with the
    // pre-extraction "select regardless" behaviour.
    const sel = { source: Source.Glade, localIdx: 99 };
    const r = createClickResolver({ pickRenderer: makePicker(sel) });
    expect(await r.resolveClick(dummyArgs)).toEqual({ kind: 'galaxy', ...sel });
  });

  it('forwards the click args to pickRenderer.pick verbatim', async () => {
    const picker = makePicker({ source: Source.SDSS, localIdx: 0 });
    const r = createClickResolver({ pickRenderer: picker });
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
