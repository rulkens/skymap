import { describe, expect, it } from 'vitest';
import {
  syntheticPointFetcher,
  SYNTHETIC_POINT_COUNT,
} from '../../../../src/services/loading/fetchers/syntheticPointFetcher';
import { Source } from '../../../../src/data/sources';

describe('syntheticPointFetcher', () => {
  it('returns a deterministic synthetic cloud regardless of request fields', async () => {
    const ac = new AbortController();
    const cloud = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'medium' },
      ac.signal,
      () => {},
    );
    expect(cloud.count).toBe(SYNTHETIC_POINT_COUNT);
    expect(cloud.positions.length).toBe(SYNTHETIC_POINT_COUNT * 3);
  });

  it('ignores tier — same cloud for medium and large', async () => {
    const ac = new AbortController();
    const a = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'medium' },
      ac.signal,
      () => {},
    );
    const b = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'large' },
      ac.signal,
      () => {},
    );
    expect(a.count).toBe(b.count);
    expect(a.positions[0]).toBe(b.positions[0]);
    expect(a.positions[1]).toBe(b.positions[1]);
    expect(a.positions[2]).toBe(b.positions[2]);
  });
});
