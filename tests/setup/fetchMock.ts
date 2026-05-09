/**
 * tests/setup/fetchMock.ts — opt-in helper for tests that stub
 * `globalThis.fetch`.
 *
 * History: until this helper landed, every fetcher test pattern looked
 * like
 *
 *     globalThis.fetch = vi.fn(() => Promise.resolve(...));
 *     // ... assertions
 *     // (no restore — pollutes the next test in the same file/worker)
 *
 * The leakage was real: vitest reuses workers across files, so a test
 * that clobbered fetch and never restored it would change the
 * `globalThis.fetch` value seen by an unrelated downstream test.  Some
 * downstream tests then *passed* spuriously (the wrong fetch happened
 * to return a Response shape they accepted).
 *
 * Usage:
 *
 *     import { useFetchMock } from '../../../setup/fetchMock';
 *
 *     describe('myFetcher', () => {
 *       const fetch = useFetchMock();   // installs beforeEach/afterEach
 *
 *       it('does the thing', async () => {
 *         fetch.mock.mockResolvedValue(new Response('...', { status: 200 }));
 *         // ... assertions on fetch.mock.calls etc.
 *       });
 *     });
 *
 * The helper returns a stable handle whose `.mock` property is a
 * `vi.Mock` that is freshly reset between tests.  `globalThis.fetch`
 * is restored after each test.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

export type FetchMockHandle = {
  mock: Mock;
};

export function useFetchMock(): FetchMockHandle {
  const handle: FetchMockHandle = { mock: vi.fn() };
  let original: typeof fetch | undefined;

  beforeEach(() => {
    original = globalThis.fetch;
    handle.mock = vi.fn();
    globalThis.fetch = handle.mock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (original !== undefined) globalThis.fetch = original;
    handle.mock.mockReset();
  });

  return handle;
}
