/**
 * expandCompanionRows — the fold from `CompanionAssetRow` to a full
 * `AssetWiringRow`, run once where `ASSET_WIRING` is built (Ruling 6). Pins
 * the derivation arithmetic and the two failure modes a chained or missing
 * parent would otherwise surface as a swallowed `TypeError` inside a demand
 * predicate, starving one asset silently.
 */

import { describe, it, expect } from 'vitest';
import { expandCompanionRows } from '../../../src/utils/loading/expandCompanionRows';
import type { AssetWiringRow } from '../../../src/@types/loading/AssetWiringRow';
import type { CompanionAssetRow } from '../../../src/@types/loading/CompanionAssetRow';
import type { DemandCtx } from '../../../src/@types/loading/DemandCtx';
import type { LoadState } from '../../../src/@types/loading/LoadState';

const parent: AssetWiringRow = {
  key: 'filaments',
  factory: () => {
    throw new Error('not called by this suite');
  },
  req: (t) => ({ small: t === 'small' }),
  demand: () => true,
  priority: 20,
};

const companion: CompanionAssetRow = {
  key: 'pgcAlias',
  factory: () => {
    throw new Error('not called by this suite');
  },
  companionOf: 'filaments',
};

function ctxWithSlotState(kind: LoadState<unknown>['kind']): DemandCtx {
  return {
    settings: {} as never,
    request: () => false,
    slotState: () => kind,
    cameraPosMpc: [0, 0, 0] as const,
    simDays: 0,
  } as unknown as DemandCtx;
}

describe('expandCompanionRows', () => {
  it('a companion derives req, demand and priority from its parent', () => {
    const [, expanded] = expandCompanionRows([parent, companion]);

    expect(expanded!.req('small')).toEqual({ small: true });
    // The parent's function is reused, not re-derived — same behaviour by construction.
    expect(expanded!.req).toBe(parent.req);
    expect(expanded!.demand(ctxWithSlotState('loading'))).toBe(true);
    expect(expanded!.demand(ctxWithSlotState('idle'))).toBe(false);
    expect(expanded!.priority).toBe(21);
    expect(expanded!.built).toBeUndefined();
  });

  it('a companion whose parent is absent or is itself a companion throws at expansion', () => {
    expect(() => expandCompanionRows([companion])).toThrow();

    const chained: CompanionAssetRow = {
      ...companion,
      key: 'famousStarsMeta',
      companionOf: 'pgcAlias',
    };
    expect(() => expandCompanionRows([companion, chained])).toThrow();
  });
});
