/**
 * /api/resolve — host-dispatch route tests.
 *
 * The handler is pure over an injected `htmlFetcher` (URL → HTML string)
 * and a `hostDispatch` map (hostname → resolver fn).  Failures surface
 * as typed errors (UnknownHostError / UnscrapeableError / UpstreamError);
 * the routing layer in apiPlugin.ts maps each class to an HTTP status
 * — see Task 5.  Tests assert on class identity, not message strings.
 */
import { describe, expect, it } from 'vitest';
import type { ResolvedMedia } from '../../../../tools/famous-curator/plugin/noirlabResolver';
import {
  handleResolve,
  UnknownHostError,
  UnscrapeableError,
  UpstreamError,
  type ResolverFn,
} from '../../../../tools/famous-curator/plugin/routes/resolve';

const FIXTURE: ResolvedMedia = {
  directUrl: 'https://noirlab.edu/public/archives/images/large/noao-foo.jpg',
  author: 'CTIO/NOIRLab/NSF/AURA',
  license: 'CC BY 4.0',
  sourceUrl: 'https://noirlab.edu/public/images/noao-foo/',
};

describe('handleResolve', () => {
  it('returns ResolvedMedia for a known host', async () => {
    const stub: ResolverFn = () => FIXTURE;
    const result = await handleResolve({
      body: { url: 'https://noirlab.edu/public/images/noao-foo/' },
      htmlFetcher: async () => '<html/>',
      hostDispatch: new Map([['noirlab.edu', stub]]),
    });
    expect(result).toEqual(FIXTURE);
  });

  it('throws UnknownHostError for an unknown host', async () => {
    await expect(
      handleResolve({
        body: { url: 'https://example.com/foo' },
        htmlFetcher: async () => '<html/>',
        hostDispatch: new Map(),
      }),
    ).rejects.toBeInstanceOf(UnknownHostError);
  });

  it('throws UnscrapeableError when resolver returns null', async () => {
    const stub: ResolverFn = () => null;
    await expect(
      handleResolve({
        body: { url: 'https://noirlab.edu/public/images/broken/' },
        htmlFetcher: async () => '<html/>',
        hostDispatch: new Map([['noirlab.edu', stub]]),
      }),
    ).rejects.toBeInstanceOf(UnscrapeableError);
  });

  it('throws UpstreamError when the fetcher rejects', async () => {
    const stub: ResolverFn = () => FIXTURE;
    await expect(
      handleResolve({
        body: { url: 'https://noirlab.edu/public/images/noao-foo/' },
        htmlFetcher: async () => { throw new Error('network'); },
        hostDispatch: new Map([['noirlab.edu', stub]]),
      }),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('throws UnknownHostError for malformed URL', async () => {
    const stub: ResolverFn = () => FIXTURE;
    await expect(
      handleResolve({
        body: { url: 'not a url' },
        htmlFetcher: async () => '<html/>',
        hostDispatch: new Map([['noirlab.edu', stub]]),
      }),
    ).rejects.toBeInstanceOf(UnknownHostError);
  });
});
