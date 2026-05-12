import { describe, expect, it, vi } from 'vitest';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { Fetcher } from '../../../src/@types/loading/Fetcher';

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

  it('commit-side race: commits run serially in generation order, slot settles to latest', async () => {
    let fetchCalls = 0;
    const fetcher: Fetcher<string, number> = vi.fn(async () => {
      fetchCalls += 1;
      return `payload-${fetchCalls}`;
    });
    const commitOrder: string[] = [];
    const commit = vi.fn(async (val: string) => {
      commitOrder.push(`start:${val}`);
      // Earlier gens get a slower commit so that without serialization
      // they would finish LAST and stomp the later gen's side-effect —
      // this is the renderer's "last writer wins" failure mode.
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
    // The commit-serialization chain forces gen 2's commit to wait for
    // gen 1's commit to fully drain, so the side-effect order matches
    // generation order even though gen 2's individual commit is faster.
    // Without the chain, payload-2 would finish first (5 ms) and
    // payload-1 would finish second (50 ms), leaving the renderer with
    // payload-1's data.
    expect(commitOrder).toEqual([
      'start:payload-1',
      'end:payload-1',
      'start:payload-2',
      'end:payload-2',
    ]);
  });

  it('medium → large → medium: latest tier wins at the side-effect layer', async () => {
    // Simulates the user-visible bug: if gen N+1's commit (slow large
    // upload) is in flight when gen N+2 (medium, fast cached) starts,
    // both commits race in the renderer and the slower one wins.  The
    // commit chain must serialize them so gen N+2's medium upload
    // actually lands last.
    const fetchedTiers: string[] = [];
    const fetcher: Fetcher<string, { tier: string }> = async (req) => {
      fetchedTiers.push(req.tier);
      return `${req.tier.toUpperCase()}-DATA`;
    };
    const writes: string[] = [];
    const commit = async (val: string) => {
      // Large is slow, medium is fast — without serialization the
      // earlier (large) write would finish last and overwrite medium.
      // Large's delay is well above vi.waitFor's polling interval so
      // the test reliably observes the 'committing' state mid-flight.
      const delay = val.startsWith('LARGE') ? 200 : 5;
      await new Promise((r) => setTimeout(r, delay));
      writes.push(val);
    };
    const slot = createAssetSlot<string, { tier: string }>({
      name: 'pts',
      fetch: fetcher,
      commit,
      retry: () => 'give-up',
    });

    slot.load({ tier: 'medium' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.load({ tier: 'large' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    slot.load({ tier: 'medium' });

    await vi.waitFor(() => expect(slot.current()).toBe('MEDIUM-DATA'));
    // The user-visible side-effect ordering: medium first, then large,
    // then medium again — ending on medium, not large.
    expect(writes).toEqual(['MEDIUM-DATA', 'LARGE-DATA', 'MEDIUM-DATA']);
  });
});
