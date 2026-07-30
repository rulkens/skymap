/**
 * Famous-curator API plugin — full route table.
 *
 * Routes (all under /api/):
 *
 *   GET  /health                       — liveness
 *   GET  /galaxies                     — seed + curated flags
 *   GET  /recipe/:id                   — load recipe.json for a curated galaxy (resume)
 *   POST /fetch                        — URL or multipart source upload
 *   POST /resolve                      — paste-a-page-URL → ResolvedMedia
 *   POST /process                      — crop + StarNet + alpha
 *   POST /process/alpha-only           — alpha pass only (cached starless)
 *   POST /export                       — write the trio + recipe.json
 *   GET  /preview/:tmpId/:name         — serve a session tmpdir file
 *
 * Body parsing: JSON requests are read via `await readJsonBody(req)`;
 * multipart uploads (only /api/fetch supports them) are read via
 * `readBinaryBody(req)`.  Both helpers are inlined below — the project
 * doesn't use express-style middleware libraries, so we roll the
 * minimal byte-collector here.
 *
 * Test driveability: this module wires the routes but doesn't own the
 * handler logic.  All five route handlers live in ./routes/ and are
 * exercised by their own tests; apiPlugin.routing.test.ts only
 * verifies the URL → handler dispatch.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleFetch } from './routes/fetch';
import { handleProcess } from './routes/process';
import { handleProcessAlphaOnly } from './routes/processAlphaOnly';
import { handleExport } from './routes/export';
import { handleGalaxies } from './routes/galaxies';
import { handleRecipe } from './routes/recipe';
import { handleBuildFamous } from './routes/buildFamous';
import {
  handleResolve,
  UnknownHostError,
  UnscrapeableError,
  UpstreamError,
  type ResolverFn,
} from './routes/resolve';
import { parseNoirLabPage } from './noirlabResolver';
import { sessionPath, createSession } from './tmpSession';
import { curatedGalaxyDir } from './paths';
import { resolveStarnetConfig, type StarnetConfig } from './starnet';
import { fetchWithCache } from '../../famous/sourceImageCache';
import { rawDataPath } from '../../utils/io/rawDataRegistry';

// Resolve the repo root relative to this file's location.
// `tools/famous-curator/plugin/apiPlugin.ts` → 3 levels up → repo root.
// We use `import.meta.url` (ESM, Vitest) when available and fall back to
// the CJS `__dirname` shim that Vite injects when processing the plugin
// via vite.config.ts.  Both produce the same absolute path.
function resolveRepoRoot(): string {
  try {
    // ESM: import.meta.url is defined; fileURLToPath converts it to a path.
    return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  } catch {
    // CJS fallback (Vite's __dirname shim or truly CJS context).
    // `__dirname` is injected by Vite's CJS transform so it is always
    // a string here; the cast silences the TypeScript "not defined in
    // global scope" error without requiring a types patch.
    return resolve(
      (globalThis as any).__dirname ?? __dirname,
      '../../..',
    );
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      try { res(body.length > 0 ? JSON.parse(body) : {}); }
      catch (err) { rej(err); }
    });
    req.on('error', rej);
  });
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

// Matches /api/preview/<8-hex-chars>/<filename-with-extensions>
// e.g. /api/preview/a1b2c3d4/source.webp
const PREVIEW_RE = /^\/api\/preview\/([a-f0-9]+)\/([\w.-]+)$/;

// Matches /api/curated/<galaxy-id>/<filename> — serves the on-disk
// export artefacts (source/starless/full/atlas.webp) so the UI can
// display the previously-exported previews when the maintainer
// re-opens a curated galaxy.  The curator's Vite has publicDir:false,
// so we can't rely on Vite's static handler — this route fills that gap.
const CURATED_RE = /^\/api\/curated\/([\w-]+)\/([\w.-]+)$/;

// MIME type map for preview-served files.  Only image types we produce;
// anything else gets the generic octet-stream fallback.
const MIME: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function apiPlugin(): Plugin {
  // Resolve StarNet config at server boot — surfaces the install hint
  // before the first /api/process call.  Falls back to mock if the env
  // can't satisfy real mode (so e.g. `npm test` doesn't need StarNet).
  let starnetConfig: StarnetConfig;
  try {
    starnetConfig = resolveStarnetConfig(process.env);
  } catch (err) {
    process.stderr.write(`curator: ${(err as Error).message}\n`);
    starnetConfig = { mock: true };
  }
  const repoRoot = resolveRepoRoot();

  // Host → resolver dispatch.  Built once at plugin boot so the map
  // identity is stable across requests (HMR re-runs the plugin factory,
  // which is what we want — a new factory means a new map, freeing the
  // old one).  Both `noirlab.edu` and `www.noirlab.edu` map to the same
  // parser because the public site serves identical markup on both.
  const hostDispatch = new Map<string, ResolverFn>([
    ['noirlab.edu', parseNoirLabPage],
    ['www.noirlab.edu', parseNoirLabPage],
  ]);

  return {
    name: 'famous-curator-api',
    configureServer(server) {
      // Connect middleware must return void; the handler below is async
      // (every route awaits its handler), so wrap it in a void-returning
      // shim rather than handing Connect a Promise it will never await.
      server.middlewares.use((req, res, next) => {
        void handleRequest(req, res, next);
      });

      async function handleRequest(
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ): Promise<void> {
        const url = req.url ?? '';
        const method = req.method ?? 'GET';
        // Only intercept /api/* — everything else (HTML, JS, HMR socket)
        // continues down the Vite middleware stack.
        if (!url.startsWith('/api/')) { next(); return; }
        // Strip query string for matching purposes.
        const path = url.split('?')[0] ?? url;
        try {
          // ── Preview file serving ─────────────────────────────────────
          // Serves raw files from a session tmpdir so the UI can display
          // intermediate WebPs without embedding them in JSON.  The route
          // matches before the fixed-path table so partial path prefixes
          // like /api/preview can't accidentally hit a named route.
          const previewMatch = PREVIEW_RE.exec(path);
          if (method === 'GET' && previewMatch) {
            const tmpId = previewMatch[1]!;
            const name = previewMatch[2]!;
            const filePath = resolve(sessionPath(tmpId), name);
            if (!existsSync(filePath)) {
              sendJson(res, 404, { error: 'preview not found' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', MIME[extname(name)] ?? 'application/octet-stream');
            // Previews are rewritten in place on every /api/process and
            // /api/process/alpha-only call — same URL, different bytes.
            // `no-store` forbids any caching layer (browser, proxy) from
            // serving a stale version when the maintainer drags the
            // alpha sliders.
            res.setHeader('Cache-Control', 'no-store');
            createReadStream(filePath).pipe(res);
            return;
          }

          // Curated artefact serving — exports from
          // `public/images/famous-curated/<id>/`.  Path traversal is
          // prevented by the `[\w-]+` / `[\w.-]+` patterns in CURATED_RE
          // (no slashes, no `..`) and the resolve()-then-startsWith check
          // below as a belt-and-braces guard.
          const curatedMatch = CURATED_RE.exec(path);
          if (method === 'GET' && curatedMatch) {
            const id = curatedMatch[1]!;
            const name = curatedMatch[2]!;
            const galaxyDir = curatedGalaxyDir(repoRoot, id);
            const filePath = resolve(galaxyDir, name);
            if (!filePath.startsWith(galaxyDir + '/') && filePath !== galaxyDir) {
              sendJson(res, 400, { error: 'invalid curated path' });
              return;
            }
            if (!existsSync(filePath)) {
              sendJson(res, 404, { error: 'curated file not found' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', MIME[extname(name)] ?? 'application/octet-stream');
            // No long cache header — the maintainer may re-export and
            // expect to see the new bytes on next click.  The UI appends
            // a ?v=<processedAt> cache-buster anyway.
            res.setHeader('Cache-Control', 'no-cache');
            createReadStream(filePath).pipe(res);
            return;
          }

          // ── Route dispatch ───────────────────────────────────────────
          if (method === 'GET' && path === '/api/health') {
            sendJson(res, 200, { ok: true });
            return;
          }

          if (method === 'GET' && path === '/api/galaxies') {
            // handleGalaxies reads the seed JSON + override index from the
            // repo; repoRoot is resolved at plugin-boot time so it stays
            // stable across HMR cycles.
            const out = await handleGalaxies({ repoRoot });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/fetch') {
            const ct = (req.headers['content-type'] ?? '') as string;
            let body: Parameters<typeof handleFetch>[0]['body'];
            if (ct.startsWith('application/json')) {
              body = await readJsonBody(req) as { url: string };
            } else {
              // multipart / octet-stream: treat the whole body as the file.
              // The UI sends the raw image bytes when the user drags a local
              // file; the Content-Type reflects the file's MIME type.
              const bytes = await readBinaryBody(req);
              body = { bytes, mediaType: ct || 'application/octet-stream' };
            }
            const out = await handleFetch({
              body,
              imageFetcher: async (u) => {
                // Persist downloads under data/raw/famous/source-cache/ so a
                // resume / re-curation reuses the original instead of re-hitting
                // the origin (a rotted upstream URL would otherwise break resume).
                const { bytes, mediaType } = await fetchWithCache(u, {
                  cacheDir: rawDataPath('famous.source-cache-dir'),
                  download: async (url) => {
                    // Wikimedia's CDN returns 429 to requests with Node's
                    // default User-Agent (which looks like a bot to them).
                    // Their User-Agent policy requires a descriptive UA with
                    // contact info — see https://meta.wikimedia.org/wiki/User-Agent_policy.
                    // Sending a meaningful UA fixes 429s on upload.wikimedia.org
                    // and is good citizenship for any other origin we hit.
                    const r = await fetch(url, {
                      headers: {
                        'User-Agent':
                          'skymap-curator/0.3 (https://github.com/rulkens/skymap; rulkens@gmail.com)',
                      },
                    });
                    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
                    return {
                      bytes: Buffer.from(await r.arrayBuffer()),
                      mediaType: r.headers.get('content-type') ?? 'application/octet-stream',
                    };
                  },
                });
                return { bytes, mediaType };
              },
              // sessionFactory is injected so the handler doesn't call
              // createSession() directly — keeps the handler testable
              // with a synthetic session root.
              sessionFactory: () => createSession(),
            });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/resolve') {
            // Paste-a-page-URL → ResolvedMedia.  The htmlFetcher closure
            // here is intentionally a near-copy of /api/fetch's
            // imageFetcher: same UA header (NOIRLab and other origins
            // both reject Node's default UA), same non-OK throw shape.
            // The only divergence is body-as-text vs body-as-bytes and
            // the missing content-type guard (we want HTML, not images).
            // Folding these into one helper would force a branch on
            // "what shape of body do you want?", which buys nothing.
            const body = await readJsonBody(req) as { url: string };
            const out = await handleResolve({
              body,
              hostDispatch,
              htmlFetcher: async (u) => {
                const r = await fetch(u, {
                  headers: {
                    'User-Agent':
                      'skymap-curator/0.3 (https://github.com/rulkens/skymap; rulkens@gmail.com)',
                  },
                });
                if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
                return await r.text();
              },
            });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/process') {
            const body = await readJsonBody(req) as Parameters<typeof handleProcess>[0]['body'];
            const out = await handleProcess({ body, starnetConfig });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/process/alpha-only') {
            const body = await readJsonBody(req) as Parameters<typeof handleProcessAlphaOnly>[0]['body'];
            const out = await handleProcessAlphaOnly({ body });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/export') {
            const body = await readJsonBody(req) as Parameters<typeof handleExport>[0]['body'];
            const out = await handleExport({ body, repoRoot, starnetConfig });
            sendJson(res, 200, out);
            return;
          }

          if (method === 'POST' && path === '/api/build-famous') {
            // No request body — the script reads from the on-disk
            // curated/ directory.  Synchronous: the script runs while
            // the request hangs, then returns stdout/stderr + status.
            const out = await handleBuildFamous({ repoRoot });
            sendJson(res, out.ok ? 200 : 500, out);
            return;
          }

          // Resume route: GET /api/recipe/:id returns the recipe.json for a
          // curated galaxy so the UI can reconstruct sliders + crop on
          // re-click.  The id is validated to word-chars + hyphens to avoid
          // path-traversal; the handler does its own existsSync check.
          const recipeMatch = /^\/api\/recipe\/([\w-]+)$/.exec(path);
          if (method === 'GET' && recipeMatch) {
            const out = await handleRecipe({ repoRoot, id: recipeMatch[1]! });
            sendJson(res, 200, out);
            return;
          }

          // Unknown /api/* path — 404.  We don't fall through to next()
          // because anything under /api/ is ours; returning 404 is more
          // explicit than letting Vite's HTML-fallback middleware try.
          sendJson(res, 404, { error: 'not found', path });
        } catch (err) {
          // Typed errors from /api/resolve take precedence over the
          // string-match cascade below.  We dispatch on class identity
          // (`instanceof`) rather than the message because the message
          // is human-debugging copy — locking the contract on it would
          // make every wording tweak in resolve.ts a silent HTTP-status
          // bug.  The class identity is the dispatch contract; messages
          // are free to evolve.
          if (err instanceof UnknownHostError) {
            sendJson(res, 404, { error: 'unknown host' });
            return;
          }
          if (err instanceof UnscrapeableError) {
            sendJson(res, 422, { error: 'page unscrapeable' });
            return;
          }
          if (err instanceof UpstreamError) {
            sendJson(res, 502, { error: 'upstream fetch failed' });
            return;
          }
          const msg = (err as Error).message;
          // 413 for the size-cap error, 400 for other validation errors,
          // 500 for everything else.  The handlers throw plain Error,
          // so we string-match against well-known messages.
          let status = 500;
          if (/50 MB/.test(msg)) status = 413;
          else if (/not an image|missing|must be|invalid/.test(msg)) status = 400;
          sendJson(res, status, { error: msg });
        }
      }
    },
  };
}
