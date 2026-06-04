/**
 * clickHandler — POI variant tests.
 *
 * Companion to `clickHandler.test.ts` (the galaxy-variant suite). This
 * file exercises the post-Plan-3 wiring where `pickRenderer.pick()`
 * returns the full discriminated `PickResult` union (galaxy | cluster
 * | supercluster | void), and the resolver routes cluster / SC / void
 * hits through an optional `resolvePoi` callback into a new
 * `{ kind: 'poi', poi }` resolution shape.
 *
 * Tests:
 *
 *   1. A `cluster` pick result with a successful `resolvePoi` lookup
 *      → `{ kind: 'poi', poi }`.
 *   2. A `void` pick result with NO matching POI (resolver returns null)
 *      → `{ kind: 'clear' }` — never silently shows a phantom card.
 *
 * The galaxy path stays covered by the sibling suite; we don't repeat
 * those cases here.
 */

import { describe, it, expect, vi } from 'vitest';

import { createClickResolver } from '../../../../src/services/engine/interaction/clickHandler';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
import type { ClickResolveInput } from '../../../../src/@types/engine/ClickResolveInput';
import type { createPickRenderer } from '../../../../src/services/gpu/renderers/pickRenderer';

type PickRenderer = ReturnType<typeof createPickRenderer>;

const virgo: StructureRecord = {
  id: 'virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const dummyArgs: ClickResolveInput = {
  pickXPx: 100,
  pickYPx: 100,
  viewportPx: [800, 600],
  visibleSources: [],
  pointSizePx: 2.5,
};

describe('createClickResolver POI variant', () => {
  it('returns kind: "poi" with the resolved POI when picker hits a cluster ring', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'cluster' as const, poiIndex: 0 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({
      pickRenderer,
      resolveSelection: vi.fn(),
      buildGalaxyInfo: vi.fn(),
      // NEW: a callback to map (category, poiIndex) -> StructureRecord.
      resolvePoi: ({ category, poiIndex }) => {
        if (category === 'cluster' && poiIndex === 0) return virgo;
        return null;
      },
    });
    const result = await resolver.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'poi', poi: virgo });
  });

  it('returns kind: "clear" when picker resolves to a void poiIndex with no matching POI', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'void' as const, poiIndex: 99 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({
      pickRenderer,
      resolveSelection: vi.fn(),
      buildGalaxyInfo: vi.fn(),
      resolvePoi: () => null,
    });
    const result = await resolver.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'clear' });
  });

  it('returns kind: "clear" when resolvePoi is omitted entirely (POI hits fall through)', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'supercluster' as const, poiIndex: 3 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({
      pickRenderer,
      resolveSelection: vi.fn(),
      buildGalaxyInfo: vi.fn(),
      // resolvePoi intentionally omitted.
    });
    const result = await resolver.resolveClick(dummyArgs);
    expect(result).toEqual({ kind: 'clear' });
  });
});
