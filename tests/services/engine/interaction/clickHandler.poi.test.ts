/**
 * clickHandler — POI variant tests.
 *
 * Companion to `clickHandler.test.ts` (the galaxy-variant suite). A
 * structure-ring pick routes the decoded `(category, poiIndex)` through
 * the optional `resolvePoi` callback and carries the record's stable id
 * as a `{ kind: 'poi', id }` Selection.
 *
 * Tests:
 *
 *   1. A `cluster` pick with a successful `resolvePoi` → `{ kind: 'poi', id }`.
 *   2. A `void` pick with no matching record (resolver → null) → null.
 *   3. `resolvePoi` omitted entirely → null (never a phantom card).
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
  it('returns a poi Selection carrying the record id when picker hits a cluster ring', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'cluster' as const, poiIndex: 0 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({
      pickRenderer,
      resolvePoi: ({ category, poiIndex }) =>
        category === 'cluster' && poiIndex === 0 ? virgo : null,
    });
    expect(await resolver.resolveClick(dummyArgs)).toEqual({ kind: 'poi', id: virgo.id });
  });

  it('returns null when picker resolves to a void poiIndex with no matching record', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'void' as const, poiIndex: 99 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({ pickRenderer, resolvePoi: () => null });
    expect(await resolver.resolveClick(dummyArgs)).toBeNull();
  });

  it('returns null when resolvePoi is omitted entirely (POI hits fall through)', async () => {
    const pickRenderer = {
      pick: vi.fn(async () => ({ kind: 'supercluster' as const, poiIndex: 3 })),
      destroy: vi.fn(),
    } as unknown as PickRenderer;

    const resolver = createClickResolver({ pickRenderer });
    expect(await resolver.resolveClick(dummyArgs)).toBeNull();
  });
});
