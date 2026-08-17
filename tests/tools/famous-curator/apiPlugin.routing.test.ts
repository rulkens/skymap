/**
 * apiPlugin routing — verifies all five real routes are reachable from
 * the middleware chain.  Drives the plugin with the same fake req/res
 * harness as apiPlugin.health.test.ts.
 *
 * Body parsing + payload handling is the route handler's problem; this
 * test just confirms the URL → handler dispatch table is wired.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiPlugin } from '../../../tools/famous-curator/plugin/apiPlugin';

type FakeReq = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  on?: (ev: string, cb: (chunk?: Buffer) => void) => void;
};
type FakeRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader: (k: string, v: string) => void;
  end: (chunk?: string) => void;
};
function fakeRes(): FakeRes {
  return {
    statusCode: 200, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    end(chunk) { if (chunk !== undefined) this.body += chunk; this.ended = true; },
  };
}

async function dispatch(req: FakeReq): Promise<FakeRes> {
  const plugin = apiPlugin();
  const mws: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
  const server = { middlewares: { use(h: typeof mws[number]) { mws.push(h); } } };
  const cfg = plugin.configureServer;
  if (typeof cfg !== 'function') throw new Error('cfg fn');
  // configureServer is typed with `this: MinimalPluginContextWithoutEnvironment`
  // but our implementation never references `this` — use call() to satisfy
  // the type-checker without importing the heavyweight Vite context shape.
  await (cfg as (server: unknown) => unknown)(server);
  const res = fakeRes();
  for (const mw of mws) {
    let nextCalled = false;
    // The plugin's middleware is a void-returning Connect handler (real
    // Vite never awaits it either — it internally fires-and-forgets an
    // async request handler). So its return value here isn't awaitable;
    // wait for the response to actually finish instead of racing ahead.
    mw(req, res, () => {
      nextCalled = true;
    });
    if (!res.ended && !nextCalled) {
      await vi.waitFor(() => {
        expect(res.ended).toBe(true);
      });
    }
    if (res.ended) break;
  }
  return res;
}

describe('apiPlugin routing', () => {
  it('returns 404 for an unknown /api path', async () => {
    const res = await dispatch({ url: '/api/nope', method: 'GET' });
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['POST', '/api/fetch'],
    ['POST', '/api/process'],
    ['POST', '/api/process/alpha-only'],
    ['POST', '/api/export'],
    ['GET',  '/api/galaxies'],
  ] as const)('dispatches %s %s (status != 404)', async (method, url) => {
    // We expect the handler to either succeed or fail with a 4xx/5xx
    // due to a missing body — what we're guarding against is "route
    // not in the table" which returns 404.
    const res = await dispatch({ url, method });
    expect(res.statusCode).not.toBe(404);
  });

  describe('POST /api/resolve', () => {
    // Stub `global.fetch` so the resolver gets the committed M94 page
    // bytes without touching the network.  The route's htmlFetcher
    // closure calls fetch() directly — same shape as imageFetcher in
    // /api/fetch — so swapping the global is the smallest seam.
    beforeEach(() => {
      const html = readFileSync(
        join(__dirname, 'fixtures', 'noirlab-noao-m94.html'),
        'utf-8',
      );
      vi.stubGlobal('fetch', async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => html,
      }));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('returns 200 for a NOIRLab URL with stub fetcher', async () => {
      // Build a request with a JSON body the plugin's readJsonBody helper
      // can consume: it listens for 'data' + 'end' on the IncomingMessage.
      // We synthesise just enough of that surface to drive the route.
      const body = JSON.stringify({ url: 'https://noirlab.edu/public/images/noao-m94/' });
      const req: FakeReq = {
        url: '/api/resolve',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        on(ev, cb) {
          if (ev === 'data') cb(Buffer.from(body));
          if (ev === 'end') cb();
        },
      };
      const res = await dispatch(req);
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body) as Record<string, unknown>;
      expect(json.directUrl).toBeTypeOf('string');
      expect(json.author).toBeTypeOf('string');
      expect(json.license).toBe('CC BY 4.0');
      expect(json.sourceUrl).toBe('https://noirlab.edu/public/images/noao-m94/');
    });
  });
});
