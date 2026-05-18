/**
 * Famous-curator API plugin.
 *
 * Vite's `configureServer` hook lets us attach Express-style middleware
 * that runs alongside the dev server.  The middleware persists across
 * HMR (Vite re-uses the same connect instance across reloads), so the
 * API surface stays available even as the UI bundle is rebuilt.
 *
 * Plan A registers only `/api/health` so the dev server boots cleanly
 * and the rest of the harness (CORS, JSON parsing, the route-table
 * dispatch shape) is in place for Plan B's heavier routes (fetch,
 * process, export, galaxies).
 *
 * Route handlers follow the convention:
 *
 *   async (req, res) => void
 *
 * The middleware wrapper inspects `req.url` against a small route table,
 * calls the matched handler, and falls through to `next()` for anything
 * not starting with `/api/`.  Each handler is responsible for setting
 * its own status code + Content-Type + calling `res.end()`.
 */
import type { Plugin } from 'vite';

/**
 * Route table.  Currently a single entry; Plan B adds /api/fetch,
 * /api/process, /api/process/alpha-only, /api/export, /api/galaxies,
 * and /api/preview/:tmpId/:name.
 */
type RouteHandler = (
  req: { url?: string; method?: string },
  res: { statusCode: number; setHeader(k: string, v: string): void; end(chunk?: string): void },
) => Promise<void> | void;

const routes: ReadonlyArray<{ method: string; path: string; handler: RouteHandler }> = [
  {
    method: 'GET',
    path: '/api/health',
    handler: (_req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    },
  },
];

export function apiPlugin(): Plugin {
  return {
    name: 'famous-curator-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        // Only intercept /api/* — everything else (HTML, JS, HMR socket)
        // continues down the Vite middleware stack.
        if (!url.startsWith('/api/')) {
          next();
          return;
        }
        // Strip query string for matching purposes.
        const path = url.split('?')[0] ?? url;
        const match = routes.find((r) => r.method === method && r.path === path);
        if (!match) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'not found', path }));
          return;
        }
        try {
          await match.handler(req as never, res as never);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}
