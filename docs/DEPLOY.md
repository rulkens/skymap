# Skymap — deploy, R2 sync, cache & CORS

Read this before any deploy, R2 sync, cache/CORS, or `.env` work.

## Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, updated independently:

- **The static shell** (HTML, JS, CSS, WGSL, `_headers`, famous WebPs) ships to **Workers Assets** automatically on every push to `main` (Cloudflare's GitHub integration builds and uploads `dist/`). No local CLI step — `npm run deploy` is just `git push origin main`.
- **The `.bin` catalog files** (~280 MB across tiers + filaments), plus famous/hi-res images, planet textures, baked mesh-body assets, and the baked Earth virtual-texture tiles, live in **R2** at `skymap-data.rulkens.com`, synced manually via `npm run sync-r2-secure` after a `build-tiers` rerun, **not** on every push. (Large tiers exceed Workers Assets' per-file caps; R2 has no caps, zero egress fees, and decouples catalog refreshes from code deploys.)

A full data-refreshing deploy:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` — only if filaments need rebuilding (rare).
3. `npm run build-surface-tiles` — only if the Earth surface virtual texture needs rebaking (rare). Read "Earth tile versioning" below first — changing pixels without bumping the version leaves the CDN serving the wrong imagery.
4. `npm run sync-r2-secure` — uploads changed files across every group (see "R2 sync architecture" below), then purges matching CDN URLs for the groups that aren't immutable; idempotent, so rerunning only moves bytes that differ. The wrapper loads `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from the OS secrets store; bare `sync-r2` (no-bash fallback) skips the purge without credentials, leaving stale CDN bytes until TTL expiry.
5. `npm run deploy` — pushes `main`; Cloudflare rebuilds the shell (~30 s).

Each `build-*` script above already tails with `npm run build-data-manifest`, which writes `public/data/manifest.json` **last**, after every file it names, so a run always leaves one coherent manifest. Baked mesh-body assets (`npm run build-meshes` — per-tier `<key>-<tier>.mesh` (e.g. `curiosity-small.mesh`) plus its three PBR WebPs, and a contact-shadow WebP for seated keys, under `public/data/meshes/`) follow the same rule: `allowDataFile` tracks them by name, so they ride the ordinary `public/data` group in `sync-r2-secure` alongside the catalog tiers, with no group of their own to configure. A hand-run `tsx tools/…` invocation skips that tail and must be followed by the pass manually — `sync-r2-secure`'s drift guard refuses to sync when the tracked set doesn't match the manifest.

### Why there is a Worker

Cloudflare Workers projects are either "Worker + Assets" or "Assets-only". On an assets-only project the dashboard's Variables-and-Secrets panel is disabled ("Variables cannot be added to a Worker that only has static assets"), so a tracked `.env.production` would be the only way to feed `VITE_DATA_BASE_URL` to the build. Any Worker script (`src/worker.ts`) makes the project Worker + Assets, which gives the dashboard runtime variables and secrets; the contact endpoint's configuration lives there, never in git. The script hands every request but `POST /api/contact` to the `ASSETS` binding, so caching, content types and the SPA fallback stay the binding's.

### Dev-tool pages (/galaxy/, /mcpm/, /flow/)

`npm run build` also builds the tool pages listed in `tools/utils/io/toolPages.ts` (galaxy-renderer, mcpm-workbench, flow-workbench) into matching `dist/` subfolders, so the same Workers Assets push serves them at `skymap.rulkens.com/<page>/`. Their vite configs switch on `command === 'build'`: base gets the subpath prefix, `publicDir` is dropped (absolute fetches like `/images/famous-curated/...` resolve against the main shell), and `envDir` points at the repo root so `VITE_DATA_BASE_URL` is inlined — the workbench then loads manifest + catalog tiers from R2 directly, covered by the existing same-origin CORS rule. Dev servers (5400/5500) are untouched.

The website (`packages/website`, an Astro npm workspace) rides the same mechanism: `toolPages.website` (`/home/`, a preview path while the app stays at the root) gives its `base` and `outDir`, and `npm run build` ends with `npm run site:build`. The build ships no `publicDir` of its own, so pages reference shared root files (`/fonts/…`, `/favicon.svg`, `/images/featured/…`) root-absolute and never through `base`. Dev: `npm run site` (port from `DEV_PORTS.website`). `SKYMAP_SITE_MODE` (`preview`, the default, or `live`; `packages/website/src/data/site.ts`) is the one switch for the robots meta, base and output folder, canonical origin, sitemap and `robots.txt`; `live` writes the site at the root of `dist/`, so use it only after the app has moved to `/app`. `public/_headers` carries the `/home/_astro/*` cache rule, which moves to `/_astro/*` with the swap. Shared root statics (`/fonts`, `/favicon.svg`, `/og-image.jpg`, `/images/featured`, and the font urls in `src/styles/tokens.css`) are root-absolute; they must keep resolving when the app moves to `/app`. The website needs Node 22.12 or newer (Astro 7), so the repo-wide `engines.node` and every CI job run Node 22.

Code-only change: **step 5 alone is enough**. The `.bin` files stay out of git (`public/data/*.bin` gitignored): they are deterministic build artefacts, and committing them would bloat clones and drift against pipeline settings.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source; callers keep passing that logical path, and `dataUrl()` is the single choke point that resolves it — through the boot-fetched `manifest.json` (logical path → content-hashed path, e.g. `galaxy-catalog/v9/sdss-large.bin` → `galaxy-catalog/v9/sdss-large.a3f19c2e.bin`) — before prefixing the result with `VITE_DATA_BASE_URL` from the committed `.env.production` (rest of `.env*` gitignored — see the .gitignore docblock). Dev has no `.env.development`: `dataUrl()` falls back to `''` and Vite serves `public/data/*` at `/data/` — the on-disk tree is hashed there too, so the manifest resolves the same way in every environment. A complete R2 sync includes every variant the runtime might request; the `buildGroups()` table in `tools/deploy/syncR2.ts` encodes the full set.

### R2 sync architecture

`tools/deploy/syncR2.ts` is only an entry point: it assembles a list of groups and runs each through `syncGroup()`. Selection, transport, ETag diffing and CDN purging live under `tools/deploy/r2/`. Each `R2SyncGroup` (`tools/deploy/r2/R2SyncGroup.ts`) carries its own policy — `transport`, `cacheControl`, `purge` — rather than the script hardcoding one policy for everything.

Two transports exist (`tools/deploy/r2/R2Transport.ts`):

- **`wrangler`** spawns one `npx wrangler r2 object put` per file, skipping any file whose remote ETag already matches. Fine for dozens of large artefacts: the `.bin` tiers, famous/hi-res images, textures, extra files, mesh sources, and every surface-tile manifest.
- **`bulk`** hands a whole group to a single `rclone copy` (`tools/deploy/r2/uploadViaRclone.ts`), which owns listing, diffing, retry and concurrency itself. The reason it exists: at wrangler's ~1-2 s process-startup cost per file, the 10912 Earth tiles would take 3-6 hours before a single byte moved.

The Earth tiles are split into two groups because of that. `buildGroups()` builds one tiles group and one manifest group per `SURFACE_TILE_REGISTRY` row, keyed by each row's `manifestKey` (as built 2026-09-17: `earth` and `mars`, the first non-Earth row through this path), with every tiles group ahead of every manifest group. The tile bodies (`collectSurfaceTiles.ts`) go up via `bulk`, `cacheControl: immutable`, `purge: false`. Each row's manifest (`collectSurfaceTileManifest.ts`) is a separate `wrangler` row placed after every tiles group — it's the pointer the runtime reads to discover that row's tiles, and must never name a tile this run hasn't finished uploading. `collectSurfaceTiles` reads the tile list from the bake's `<manifestKey>/index.txt` rather than walking the tile tree: the bake writes that index last, so an interrupted bake leaves no index and the sync correctly uploads nothing rather than a partial tile set.

The `Mesh sources` group backs up the pristine downloads and edited `<key>.blend` files listed in `meshes.sha256` under `data/raw/meshes/`; restoring from that backup is `data/raw/meshes/README.md`.

If a bulk group has files but the credentials below are missing, `syncR2.ts` fails in a preflight before any upload starts, rather than partway through a run.

#### Earth tile versioning

Tile keys sit under a versioned prefix (currently `earth-tiles/v10`; the `TILE_PREFIX` constant in `tools/textures/surfaceBodies/earthSurfaceBake.ts` is the source of truth, written into `manifest.json` and read back from there by the runtime — `surfaceTileSubsystem.ts` takes the prefix off the manifest, so a version switch needs no code deploy). The tiles are served `public, max-age=31536000, immutable` and never purged, so **re-baking changed bytes means bumping that version** — nothing in the code enforces this. Measured, not assumed: `.webp` is on Cloudflare's default cacheable-extension list, so these tiles really are edge-cached (`cf-cache-status: HIT`), unlike the `.bin` files in the note at the end of this file. Reusing a version leaves stale bytes in two caches: the edge can be purged, but a **browser** cache holding an immutable object cannot be, so a returning visitor is stuck mixing old and new tiles — for height tiles that means some patches displaced and some flat, with seams between them.

A manifest SHAPE change (not just pixels — e.g. `bands` growing a second band) is a sharper case: `fetchSurfaceTileManifest`'s runtime guard rejects any manifest shape it doesn't recognise, so between a merge that changes the shape and the next `npm run sync-r2-secure`, every client fetches the stale R2 manifest, gets rejected, and surface tiles are OFF in production entirely — the sync is a blocking merge step, not a follow-up.

A height-only re-bake moves in this order, because only the height product's bytes changed: rename the local tree to the new prefix and rewrite `<manifestKey>/index.txt` and the `prefix` field in `<manifestKey>/manifest.json`; server-side copy `<old>/albedo` to `<new>/albedo` (same bytes, new prefix — no re-upload, `rclone copy r2:skymap-data/... r2:skymap-data/...` within the bucket); `bulk`-upload the new `<new>/height` tiles; sync the manifest last, which is the atomic switch since it is `no-cache` and purged. Height display is OFF in production for that whole window — the manifest still names the old prefix's height tiles, and the new decoder rejects them. That was the v8 → v9 move (raw f32 `.bin` → lossless Terrain-RGB `.webp`) and the v9 → v10 move (the `SHGT` header chunk grew the CPU post grid, so every height tile's bytes changed while its pixels did not). Prune the superseded prefix once the new one verifies.

#### Credentials

The `bulk` transport needs R2's **S3 API** credentials (`tools/deploy/r2/rcloneEnv.ts`), which are a different thing from the Cloudflare API token wrangler uses. Create them in the Cloudflare dashboard under R2 → Manage API tokens → Create token → Object Read & Write; you get an account id, an access key id, and a secret access key. `syncR2Secure.sh` loads all three from the OS keychain:

```
security add-generic-password -a "$USER" -s skymap-r2-account-id        -w 'ACCOUNT_ID'
security add-generic-password -a "$USER" -s skymap-r2-access-key-id     -w 'KEY_ID'
security add-generic-password -a "$USER" -s skymap-r2-secret-access-key -w 'SECRET'
```

rclone is configured entirely through `RCLONE_CONFIG_R2_*` environment variables, so no secret is ever written to a config file on disk.

### Films (`films/` prefix)

Rendered takes that are too big to mail (a 4096² dome take is ~2 GB) go to the same bucket under `films/<YYYY-MM-DD>-<take>.mp4`, served at `https://skymap-data.rulkens.com/films/...`. They are one-off deliverables, so they are deliberately outside `syncR2.ts`'s groups: upload with `rclone copyto <file> r2:skymap-data/films/<name>.mp4 --header-upload "Content-Type: video/mp4"` using the S3 credentials above, and list what is there with `rclone ls r2:skymap-data/films/`. The prefix carries a lifecycle rule that deletes objects after 90 days, so a link mailed out is temporary by design and nothing has to be remembered; re-apply the rule with `npx wrangler r2 bucket lifecycle add skymap-data films-expire-90d films/ --expire-days 90` if the bucket is ever recreated.

### Site media (`data/site/` prefix)

The website's hero film (`npm run site:media`, see `tools/site/README.md`) is one versioned file, `public/data/site/<videoFile>` (the name is `HERO_MEDIA.videoFile` in `tools/site/heroMediaPlan.ts`), served at `${VITE_DATA_BASE_URL}/data/site/<videoFile>`; the site reads the same variable the app does. It stays outside `syncR2.ts` on purpose: the sync would need a new collector and an `.mp4` content type in `uploadViaWrangler.ts`, and the file is neither hashed nor in the data manifest, so a group row would not be "one clean row". Upload it by hand, with the S3 credentials above, after each `site:media` run that changes the file:

```
rclone copyto public/data/site/earth-to-universe-v1.mp4 r2:skymap-data/data/site/earth-to-universe-v1.mp4 --header-upload "Content-Type: video/mp4" --header-upload "Cache-Control: public, max-age=31536000, immutable"
```

The name carries a version because the object is `immutable` and never purged: new bytes mean a new name, never an overwrite. Until the file is uploaded the page falls back to its poster. The data manifest's drift guard ignores `public/data/site/` (`allowDataFile` is an allow-list and names nothing there), so neither `build-data-manifest` nor `sync-r2` sees it.

### Opening the contact form

The website's form on `/domes/` posts to `POST /api/contact`, a route of the existing Worker (`src/worker.ts`, handler `src/services/worker/handleContact.ts`). It is **closed until you configure it**: while any of the four values below is missing the route answers `503 {"error":"not_configured"}` and does nothing else, and the site build shows "Contact opens soon" instead of the form until both site values are set. Every other request, and any other method on that path, goes to the static assets as before (`run_worker_first = ["/api/contact"]` in `wrangler.toml` only makes the Worker see that path; a `GET` there still gets the SPA fallback). The path is root-absolute and independent of the site's base, so the later move of the site to the root changes nothing here.

What it does: checks `Origin` is the page's own origin, the content type is JSON, the body is at most 16 KB and each field within its cap (`src/data/worker/contactConfig.ts`), answers `200` without sending when the honeypot `website` is filled, verifies the Turnstile token with `siteverify`, then sends one plain-text email (`Reply-To` the visitor, `From` your own address) through the `send_email` binding. Statuses: 200 sent · 400 a field is invalid (the body names it) · 403 wrong `Origin` or spam check failed · 413 body too large · 415 not JSON · 502 Turnstile unreachable or the email provider refused · 503 not configured. It stores nothing (no KV, no D1) and logs only the provider's error code. There is no rate limit of its own (it would need new infrastructure); Turnstile is the guard, and a dashboard rate-limiting rule on `POST /api/contact` can be added later without a code change.

Steps, in order (each is yours; nothing here has been done):

1. **Email Routing and a verified destination.** Dashboard → the `rulkens.com` zone → Email → Email Routing → enable it, then add your own inbox as a destination address and click the link in the verification mail. A Worker may send only to a verified destination.
2. **Email sending for the sender domain.** Dashboard → Compute → Email Service → Email Sending → Onboard Domain, and pick the domain (or a subdomain) the sender address will be on; Cloudflare adds the SPF, DKIM and DMARC records. The sender must be on an onboarded domain or the binding refuses with `E_SENDER_NOT_VERIFIED` (a `502` from the endpoint).
3. **Turnstile widget.** Dashboard → Turnstile → Add widget; hostnames `skymap.rulkens.com` (add `localhost` only while testing); mode Managed. Keep the **site key** (public) and the **secret key**.
4. **The binding.** Add to `wrangler.toml` (the Git deploy treats that file as the source of truth for bindings, so a binding added only in the dashboard can be dropped by the next deploy):

   ```toml
   [[send_email]]
   name = "CONTACT_EMAIL"
   ```

5. **Three secrets** (never `[vars]`, never the repo): `npx wrangler secret put CONTACT_TO` (your inbox, the verified destination), `npx wrangler secret put CONTACT_FROM` (the sender address on the onboarded domain), `npx wrangler secret put TURNSTILE_SECRET_KEY`. Secrets survive deploys.
6. **The two site values**, as build variables of the Cloudflare project (the same route as `SKYMAP_SITE_MODE`): `SKYMAP_CONTACT_ENDPOINT=/api/contact` and `SKYMAP_TURNSTILE_SITE_KEY=<the site key>`. Both are public, and the form is rendered only when both are set. They are read at build time, so push (or retrigger a build) after setting them. If the domes page still says "Contact opens soon" after that build, the values did not reach `process.env` of the build; `.gitignore` records a case where dashboard variables did not.
7. **Update `/privacy/` the same day.** The "plan, not yet in effect" paragraph in `packages/website/src/pages/privacy.astro` and the fact row `privacy-form-closed` in `packages/website/src/data/privacyFacts.ts` describe a design; rewrite them as what happens, and change the date at the foot of the page. The widget is a third-party request (`challenges.cloudflare.com`, on the domes page only, once the form scrolls into view), so the "what the website loads" facts change too.

Test before step 6 with `npx wrangler dev` (default port 8787) and a git-ignored `.dev.vars` file holding `CONTACT_TO`, `CONTACT_FROM` and `TURNSTILE_SECRET_KEY`. `wrangler dev` simulates `send_email`: it prints the message and writes its text under `.wrangler/` instead of sending (add `remote = true` to the binding to send for real). Turnstile's documented test secrets work with any token: `1x0000000000000000000000000000000AA` always passes, `2x0000000000000000000000000000000AA` always fails (site key for the widget: `1x00000000000000000000AA`).

```
curl -i -X POST http://localhost:8787/api/contact -H 'Origin: http://localhost:8787' -H 'Content-Type: application/json' -d '{"name":"Ada","organisation":"Wisdome","email":"ada@example.org","message":"A dome.","website":"","token":"x"}'
```

To close the form again, delete any one secret (`npx wrangler secret delete CONTACT_TO`) and unset the site values; the endpoint answers 503 and the page shows its closed state.

### Cache-Control + CORS

- **Cache:** shell via `public/_headers` (JS/CSS/WGSL/WASM `max-age=31536000, immutable`; famous WebPs `max-age=86400`) — these rules are belt-and-braces that only reach `public/data/` under a local `vite preview`; production data bytes come from R2, whose cache policy is set independently by `buildGroups()`. R2 objects get their `Cache-Control` per group from `buildGroups()` in `syncR2.ts`: every hashed data file (the five binary families under `public/data/` plus the root JSON) is `immutable, max-age=31536000` and never purged — the content hash invalidates a stale file, not the cache header. `manifest.json` is the one exception: `no-cache`, purged on every sync, and uploaded **last** so it never names a file the run hasn't finished uploading. Famous/hi-res images, planet textures, and every surface-tile manifest keep `max-age=86400`; the surface-tile bodies stay `immutable` (their own `<manifestKey>/vN` epoch, see above). `Mesh sources` is `no-cache` too but never purged: an edited `.blend` is re-saved under the same key, so an `immutable` header would hand a restore the pre-edit bytes. A purge must name each CORS origin: the CDN caches one copy per `Origin` header, and a bare-URL purge misses the copy the page fetches (`purgeFileEntries.ts` expands every URL over the `r2Cors.json` origins).
- **CORS:** one R2 rule allows `GET`/`HEAD` from `skymap.rulkens.com`, `skymap.rulkens.workers.dev`, and `localhost:5173`; re-apply with `npm run r2-cors` (`tools/deploy/r2Cors.json`).

### Wire compression + edge cache

`uploadViaWrangler.ts` gzips eligible files before the `wrangler r2 object put`, uploading with `--content-encoding gzip` so R2 stores the compressed bytes; `tools/deploy/r2/shouldGzipOnWire.ts` is the source of truth for which files qualify (and why the two exclusions are excluded) — read it rather than trusting a file list here. Compression is transparent end to end: the browser's `fetch` decodes `Content-Encoding: gzip` automatically before the app ever sees the bytes, so `dataUrl()`/`fetchWithProgress`/the parsers are all unchanged. Local dev is unaffected too — Vite serves `public/data/*` uncompressed, so nothing here has a dev-vs-prod branch to keep in sync.

Because the stored bytes for eligible files change (gzip compressed vs. raw), `tools/deploy/r2/localUploadHash.ts` hashes the same gzipped bytes for the ETag comparison `syncGroup.ts` uses to skip unchanged files — see its docblock. One consequence: **the first `sync-r2` run after this ships will re-upload every eligible file once** (its stored ETag was hashed from the old raw bytes, so every comparison mismatches). This is expected and one-time; subsequent runs skip normally again.

**Manual step, not covered by this change:** production currently edge-caches nothing for `skymap-data.rulkens.com` (`cf-cache-status: DYNAMIC` on every request) even though R2 already sends `immutable` cache-control — Cloudflare's default cacheable-extension list doesn't include `.bin`/`.scfd`. Someone with dashboard access needs to add a Cache Rule for that host: **Cache eligible: everything, respect origin cache-control**.
