import { describe, expect, it } from 'vitest';
import type { OfflineInventory } from '../../../../tools/deploy/@types/OfflineInventory';
import { planSync } from '../../src/sync/planSync';

const inventory: OfflineInventory = {
  groups: [
    { label: 'one', files: [{ key: 'data/a.bin', size: 10, sha256: 'A' }] },
    {
      label: 'two',
      files: [
        { key: 'data/b.bin', size: 20, sha256: 'B' },
        { key: 'data/c.bin', size: 40, sha256: 'C' },
      ],
    },
  ],
};
const all = new Set(['data/a.bin', 'data/b.bin', 'data/c.bin']);
const syncedAll = { 'data/a.bin': 'A', 'data/b.bin': 'B', 'data/c.bin': 'C' };

describe('planSync', () => {
  it('downloads nothing when every file is synced and present', () => {
    const plan = planSync(inventory, syncedAll, all);
    expect(plan.groups.flatMap((g) => g.download)).toEqual([]);
    expect(plan.downloadBytes).toBe(0);
  });

  it('downloads a file whose sha changed', () => {
    const plan = planSync(inventory, { ...syncedAll, 'data/b.bin': 'old' }, all);
    expect(plan.groups[1]?.download.map((f) => f.key)).toEqual(['data/b.bin']);
  });

  it('downloads a synced file missing on disk', () => {
    const plan = planSync(inventory, syncedAll, new Set(['data/a.bin', 'data/c.bin']));
    expect(plan.groups[1]?.download.map((f) => f.key)).toEqual(['data/b.bin']);
  });

  it('keeps inventory group order', () => {
    const plan = planSync(inventory, {}, new Set());
    expect(plan.groups.map((g) => g.label)).toEqual(['one', 'two']);
  });

  it('sums downloadBytes over downloads only', () => {
    const plan = planSync(inventory, { 'data/a.bin': 'A', 'data/b.bin': 'B' }, all);
    expect(plan.downloadBytes).toBe(40);
  });
});
