/**
 * apiPlugin — /api/health route test.
 *
 * Drives the plugin's configureServer middleware with a fake express-
 * style request/response pair instead of booting a real http.Server.
 * This keeps the test free of port allocation, async cleanup, and the
 * 50-100 ms startup tax of an actual Vite dev server.
 */
import { describe, expect, it } from 'vitest';
import { apiPlugin } from '../../../tools/famous-curator/plugin/apiPlugin';

type FakeRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader: (k: string, v: string) => void;
  end: (chunk?: string) => void;
};

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      this.ended = true;
    },
  };
  return res;
}

describe('apiPlugin /api/health', () => {
  it('returns { ok: true } as JSON with status 200', async () => {
    const plugin = apiPlugin();
    // configureServer is the hook Vite calls during server bootstrap.
    // We synthesise the bits of `ViteDevServer` the plugin actually uses.
    const middlewares: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
    const fakeServer = {
      middlewares: {
        use(handler: (req: unknown, res: unknown, next: () => void) => unknown) {
          middlewares.push(handler);
        },
      },
    };
    // Call the lifecycle hook.  Plugin types allow `configureServer` to
    // be a fn or { handler: fn }; we handle the function form.
    const cfg = plugin.configureServer;
    if (typeof cfg !== 'function') throw new Error('configureServer must be a function');
    // Cast through unknown — Vite types `configureServer` with a bound
    // `this` context we don't synthesise; calling it as a free function
    // is fine for our hook (it only touches `server.middlewares`).
    await (cfg as (server: unknown) => Promise<void> | void)(fakeServer);

    expect(middlewares.length).toBeGreaterThanOrEqual(1);

    // Walk the middleware chain with a request for /api/health.
    const req = { url: '/api/health', method: 'GET' };
    const res = fakeRes();
    let nextCalled = false;
    for (const mw of middlewares) {
      // eslint-disable-next-line no-await-in-loop
      await mw(req, res, () => {
        nextCalled = true;
      });
      if (res.ended) break;
    }

    expect(res.ended).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(nextCalled).toBe(false);
  });

  it('passes non-/api requests through to next()', async () => {
    const plugin = apiPlugin();
    const middlewares: Array<(req: unknown, res: unknown, next: () => void) => unknown> = [];
    const fakeServer = {
      middlewares: {
        use(h: (typeof middlewares)[number]) {
          middlewares.push(h);
        },
      },
    };
    const cfg = plugin.configureServer;
    if (typeof cfg !== 'function') throw new Error('configureServer must be a function');
    // Cast through unknown — Vite types `configureServer` with a bound
    // `this` context we don't synthesise; calling it as a free function
    // is fine for our hook (it only touches `server.middlewares`).
    await (cfg as (server: unknown) => Promise<void> | void)(fakeServer);

    const req = { url: '/index.html', method: 'GET' };
    const res = fakeRes();
    let nextCalled = false;
    for (const mw of middlewares) {
      // eslint-disable-next-line no-await-in-loop
      await mw(req, res, () => {
        nextCalled = true;
      });
    }
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });
});
