# Skymap — deploy, R2 sync, cache & CORS

Read this before any deploy, R2 sync, cache/CORS, or `.env` work.

## Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, updated independently:

- **The static shell** (HTML, JS, CSS, WGSL, `_headers`, famous WebPs) ships to **Workers Assets** automatically on every push to `main` (Cloudflare's GitHub integration builds and uploads `dist/`). No local CLI step — `npm run deploy` is just `git push origin main`.
- **The `.bin` catalog files** (~280 MB across tiers + filaments) live in **R2** at `skymap-data.rulkens.com`, synced manually via `npm run sync-r2-secure` after a `build-tiers` rerun, **not** on every push. (Large tiers exceed Workers Assets' per-file caps; R2 has no caps, zero egress fees, and decouples catalog refreshes from code deploys.)

A full data-refreshing deploy:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` — only if filaments need rebuilding (rare).
3. `npm run sync-r2-secure` — uploads `.bin` + `famous_*.json` + `structures.*`, then purges matching CDN URLs; idempotent full-bucket replacement. The wrapper loads `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from the OS secrets store; bare `sync-r2` (no-bash fallback) skips the purge without credentials, leaving stale CDN bytes until TTL expiry.
4. `npm run deploy` — pushes `main`; Cloudflare rebuilds the shell (~30 s).

Code-only change: **step 4 alone is enough**. The `.bin` files stay out of git (`public/data/*.bin` gitignored): they are deterministic build artefacts, and committing them would bloat clones and drift against pipeline settings.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source; `dataUrl()` prefixes paths with `VITE_DATA_BASE_URL` from the committed `.env.production` (rest of `.env*` gitignored — see the .gitignore docblock). Dev has no `.env.development`: `dataUrl()` falls back to `''` and Vite serves `public/data/*` at `/data/`. A complete R2 sync includes every variant the runtime might request; the `tools/deploy/syncR2.ts` ALLOW filter encodes the full set.

### Cache-Control + CORS

- **Cache:** shell via `public/_headers` (JS/CSS/WGSL/WASM `max-age=31536000, immutable`; famous WebPs `max-age=86400`); R2 objects per-object on upload by `syncR2.ts` (`max-age=86400`).
- **CORS:** one R2 rule allows `GET`/`HEAD` from `skymap.rulkens.com`, `skymap.rulkens.workers.dev`, and `localhost:5173`; re-apply with `npm run r2-cors` (`tools/deploy/r2Cors.json`).
