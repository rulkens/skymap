import { describe, expect, it, vi } from 'vitest';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { Fetcher } from '../../../src/services/loading/types';

/**
 * Regression test for the cloudLoader race condition described in the
 * 2026-05-07-asset-loading-design.md spec.  Rapid load() calls must
 * settle to the LATEST request's value, never an earlier request's.
 */
describe('AssetSlot tier-swap race', () => {
  it('rapid load(small) → load(large) → load(medium) settles to medium', async () => {
    const resolvers = new Map<string, (v: string) => void>();
    const fetcher: Fetcher<string, { tier: string }> = (req, signal) =>
      new Promise<string>((resolve, reject) => {
        resolvers.set(req.tier, resolve);
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    const uploaded: string[] = [];
    const slot = createAssetSlot<string, { tier: string }>({
      name: 'pts',
      fetch: fetcher,
      commit: async (val) => {
        uploaded.push(val);
        await new Promise((r) => setTimeout(r, 5));  // simulate async GPU upload
      },
      retry: () => 'give-up',
    });

    slot.load({ tier: 'small' });
    slot.load({ tier: 'large' });
    slot.load({ tier: 'medium' });

    // Resolve in order opposite to request — large arrives first, then medium, then small.
    resolvers.get('large')?.('LARGE-DATA');
    resolvers.get('medium')?.('MEDIUM-DATA');
    resolvers.get('small')?.('SMALL-DATA');

    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('MEDIUM-DATA');
    // Race-fix: only the latest request's value reaches commit.
    expect(uploaded).toEqual(['MEDIUM-DATA']);
  });

  it('commit-side race: commit completes for superseded value, slot still settles to latest', async () => {
    let fetchCalls = 0;
    const fetcher: Fetcher<string, number> = vi.fn(async () => {
      fetchCalls += 1;
      return `payload-${fetchCalls}`;
    });
    const commitOrder: string[] = [];
    const commit = vi.fn(async (val: string) => {
      commitOrder.push(`start:${val}`);
      await new Promise((r) => setTimeout(r, val === 'payload-1' ? 50 : 5));
      commitOrder.push(`end:${val}`);
    });
    const slot = createAssetSlot<string, number>({
      name: 'pts',
      fetch: fetcher,
      commit,
      retry: () => 'give-up',
    });

    slot.load(1);
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    slot.load(2);

    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('payload-2');
    // Both commits ran (commit was already in flight for payload-1) but only
    // payload-2's `committed` event reached the reducer — the second
    // race-check dropped payload-1's late notification.
  });
});
