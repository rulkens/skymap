// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock the fetcher before importing the hook so the import binds to the mock.
vi.mock('../../src/services/loading/fetchers/famousMetaFetcher', () => ({
  famousMetaFetcher: vi.fn(),
}));

import { famousMetaFetcher } from '../../src/services/loading/fetchers/famousMetaFetcher';
import { useFamousMeta } from '../../src/hooks/useFamousMeta';

describe('useFamousMeta `ready` flag', () => {
  beforeEach(() => {
    vi.mocked(famousMetaFetcher).mockReset();
  });

  it('starts with ready=false', () => {
    vi.mocked(famousMetaFetcher).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useFamousMeta());
    expect(result.current.ready).toBe(false);
  });

  it('flips ready=true once the fetch resolves', async () => {
    vi.mocked(famousMetaFetcher).mockResolvedValue({ meta: [] });
    const { result } = renderHook(() => useFamousMeta());
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('flips ready=true even when the fetch rejects (fail-soft)', async () => {
    vi.mocked(famousMetaFetcher).mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useFamousMeta());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.famousMeta).toEqual([]);
  });
});
