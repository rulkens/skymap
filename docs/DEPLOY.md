# Skymap — deploy, R2 sync, cache & CORS

Read this before any deploy, R2 sync, cache/CORS, or `.env` work.

## Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, updated independently:

- **The static shell** (HTML, JS, CSS, WGSL, `_headers`, famous WebPs) ships to **Workers Assets** automatically on every push to `main` (Cloudflare's GitHub integration builds and uploads `dist/`). No local CLI step — `npm run deploy` is just `git push origin main`.
- **The `.bin` catalog files** (~280 MB across tiers + filaments), plus famous/hi-res images, planet textures, and the baked Earth virtual-texture tiles, live in **R2** at `skymap-data.rulkens.com`, synced manually via `npm run sync-r2-secure` after a `build-tiers` rerun, **not** on every push. (Large tiers exceed Workers Assets' per-file caps; R2 has no caps, zero egress fees, and decouples catalog refreshes from code deploys.)

A full data-refreshing deploy:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` — only if filaments need rebuilding (rare).
3. `npm run build-earth-tiles` — only if the Earth surface virtual texture needs rebaking (rare). Read "Earth tile versioning" below first — changing pixels without bumping the version leaves the CDN serving the wrong imagery.
4. `npm run sync-r2-secure` — uploads changed files across every group (see "R2 sync architecture" below), then purges matching CDN URLs for the groups that aren't immutable; idempotent, so rerunning only moves bytes that differ. The wrapper loads `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from the OS secrets store; bare `sync-r2` (no-bash fallback) skips the purge without credentials, leaving stale CDN bytes until TTL expiry.
5. `npm run deploy` — pushes `main`; Cloudflare rebuilds the shell (~30 s).

Each `build-*` script above already tails with `npm run build-data-manifest`, which writes `public/data/manifest.json` **last**, after every file it names, so a run always leaves one coherent manifest. A hand-run `tsx tools/…` invocation skips that tail and must be followed by the pass manually — `sync-r2-secure`'s drift guard refuses to sync when the tracked set doesn't match the manifest.

Code-only change: **step 5 alone is enough**. The `.bin` files stay out of git (`public/data/*.bin` gitignored): they are deterministic build artefacts, and committing them would bloat clones and drift against pipeline settings.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source; the logical filename first resolves through the boot-fetched `manifest.json` (logical path → content-hashed path, e.g. `galaxy-catalog/v9/sdss-large.bin` → `galaxy-catalog/v9/sdss-large.a3f19c2e.bin`), and only that resolved, already-hashed path goes to `dataUrl()`, which prefixes it with `VITE_DATA_BASE_URL` from the committed `.env.production` (rest of `.env*` gitignored — see the .gitignore docblock). Dev has no `.env.development`: `dataUrl()` falls back to `''` and Vite serves `public/data/*` at `/data/` — the on-disk tree is hashed there too, so the manifest resolves the same way in every environment. A complete R2 sync includes every variant the runtime might request; the `buildGroups()` table in `tools/deploy/syncR2.ts` encodes the full set.

### R2 sync architecture

`tools/deploy/syncR2.ts` is only an entry point: it assembles a list of groups and runs each through `syncGroup()`. Selection, transport, ETag diffing and CDN purging live under `tools/deploy/r2/`. Each `R2SyncGroup` (`tools/deploy/r2/R2SyncGroup.ts`) carries its own policy — `transport`, `cacheControl`, `purge` — rather than the script hardcoding one policy for everything.

Two transports exist (`tools/deploy/r2/R2Transport.ts`):

- **`wrangler`** spawns one `npx wrangler r2 object put` per file, skipping any file whose remote ETag already matches. Fine for dozens of large artefacts: the `.bin` tiers, famous/hi-res images, textures, extra files, and the Earth tile manifest.
- **`bulk`** hands a whole group to a single `rclone copy` (`tools/deploy/r2/uploadViaRclone.ts`), which owns listing, diffing, retry and concurrency itself. The reason it exists: at wrangler's ~1-2 s process-startup cost per file, the 10912 Earth tiles would take 3-6 hours before a single byte moved.

The Earth tiles are split into two groups because of that. The tile bodies (`collectEarthTiles.ts`) go up via `bulk`, `cacheControl: immutable`, `purge: false`. The manifest (`collectEarthTileManifest.ts`) is a separate `wrangler` row that `buildGroups()` places last — it's the pointer the runtime reads to discover tiles, and must never name a tile this run hasn't finished uploading. `collectEarthTiles` reads the tile list from the bake's `earth-tiles/index.txt` rather than walking the tile tree: the bake writes that index last, so an interrupted bake leaves no index and the sync correctly uploads nothing rather than a partial tile set.

If a bulk group has files but the credentials below are missing, `syncR2.ts` fails in a preflight before any upload starts, rather than partway through a run.

#### Earth tile versioning

Tile keys sit under a versioned prefix (`earth-tiles/v1`, the `TILE_PREFIX` constant in `tools/textures/buildEarthTiles.ts`, named by `manifest.json` and read back by the runtime). The tiles are served `immutable` and never purged, so **re-baking changed pixels means bumping that version** — nothing in the code enforces this. Reusing a version after a pixel change leaves the CDN serving stale tiles against a new manifest for up to a day: not merely stale, but mismatched, since the manifest now names levels the edge hasn't updated.

#### Credentials

The `bulk` transport needs R2's **S3 API** credentials (`tools/deploy/r2/rcloneEnv.ts`), which are a different thing from the Cloudflare API token wrangler uses. Create them in the Cloudflare dashboard under R2 → Manage API tokens → Create token → Object Read & Write; you get an account id, an access key id, and a secret access key. `syncR2Secure.sh` loads all three from the OS keychain:

```
security add-generic-password -a "$USER" -s skymap-r2-account-id        -w 'ACCOUNT_ID'
security add-generic-password -a "$USER" -s skymap-r2-access-key-id     -w 'KEY_ID'
security add-generic-password -a "$USER" -s skymap-r2-secret-access-key -w 'SECRET'
```

rclone is configured entirely through `RCLONE_CONFIG_R2_*` environment variables, so no secret is ever written to a config file on disk.

### Cache-Control + CORS

- **Cache:** shell via `public/_headers` (JS/CSS/WGSL/WASM `max-age=31536000, immutable`; famous WebPs `max-age=86400`) — these rules are belt-and-braces that only reach `public/data/` under a local `vite preview`; production data bytes come from R2, whose cache policy is set independently by `buildGroups()`. R2 objects get their `Cache-Control` per group from `buildGroups()` in `syncR2.ts`: every hashed data file (the five binary families under `public/data/` plus the root JSON) is `immutable, max-age=31536000` and never purged — the content hash invalidates a stale file, not the cache header. `manifest.json` is the one exception: `no-cache`, purged on every sync, and uploaded **last** so it never names a file the run hasn't finished uploading. Famous/hi-res images, planet textures, and the Earth tile manifest keep `max-age=86400`; the Earth tile bodies stay `immutable` (their own `earth-tiles/vN` epoch, see above).
- **CORS:** one R2 rule allows `GET`/`HEAD` from `skymap.rulkens.com`, `skymap.rulkens.workers.dev`, and `localhost:5173`; re-apply with `npm run r2-cors` (`tools/deploy/r2Cors.json`).
