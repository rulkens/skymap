import { describe, expect, it } from 'vitest';
import { satellitesSearch } from '../../../../src/layers/satellites/focus/present/satellitesSearch';
import { createAssetSlot } from '../../../../packages/shared/src/services/loading/AssetSlot';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';

describe('satellitesSearch', () => {
  it('ends without rows when the slot is released before its catalog lands', async () => {
    const slot = createAssetSlot<ArrayBuffer, void>({
      name: 'satellites',
      fetch: () => new Promise<ArrayBuffer>(() => {}),
    });
    const runtime = { slot, propagator: { catalog: () => null } } as unknown as SatellitesRuntime;
    void slot.load();
    const pending = satellitesSearch(runtime)[Symbol.asyncIterator]().next();
    slot.release();
    const outcome = await Promise.race([
      pending.then((r) => (r.done ? 'ended' : 'rows')),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 20)),
    ]);
    expect(outcome).toBe('ended');
  });
});
