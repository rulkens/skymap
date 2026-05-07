import { describe, expect, it, vi } from 'vitest';
import { filamentFetcher } from '../../../../src/services/loading/fetchers/filamentFetcher';

describe('filamentFetcher', () => {
  it('uses filaments-small.bin for small tier', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('skip body'));
    globalThis.fetch = fetchSpy;
    await filamentFetcher({ tier: 'small' }, new AbortController().signal, () => {}).catch(
      () => {},
    );
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('filaments-small.bin');
  });

  it('uses filaments.bin for medium and large', async () => {
    for (const tier of ['medium', 'large'] as const) {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('skip body'));
      globalThis.fetch = fetchSpy;
      await filamentFetcher({ tier }, new AbortController().signal, () => {}).catch(() => {});
      const url = fetchSpy.mock.calls[0]?.[0] as string;
      expect(url).toMatch(/\/filaments\.bin$/);
    }
  });
});
