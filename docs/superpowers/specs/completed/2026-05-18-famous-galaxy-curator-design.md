# Famous Galaxy Curator — design

**Date:** 2026-05-18
**Status:** Draft, awaiting user review
**Author:** Brainstormed with Claude

## Problem

`tools/famous/fetchFamousImages.ts` automates thumbnail acquisition for the
~75 hand-curated famous galaxies by walking a Wikipedia title chain (with
DESI / SDSS / unWISE fallbacks). The pipeline works, but the output quality
is uneven and capped by what's automatable from public sources:

- **Framing is whatever Wikipedia ships.** Some hero images are tight on
  the bulge; some are wide-field with the galaxy in a corner.
- **Foreground stars stay in.** No source we can automate (ESA / ESO /
  Wikipedia / DESI) ships a starless version. The renderer's
  `lumAlpha` smoothstep does what it can at draw time, but small bright
  stars on top of a dim halo still punch through.
- **Whole-galaxy + HDR is structurally unavailable.** As explored in the
  spike sessions of 2026-05-17 / 18, press-kit "Original TIFFs" from ESA
  / ESO are almost always 8-bit; genuine HDR only lives in private
  PixInsight / FITS masters that aren't redistributable.

We validated in the spike that StarNet2 (the Torch / MPS macOS build) does
a clean job of star removal in ~8-15 s per image. Combined with a
luminance-derived alpha channel (the `applyLuminanceAsAlpha` helper added
to `tools/famous/famousImageProcessor.ts` during the spike), we can
produce dramatically better thumbnails — but only if a human is in the
loop to pick a good source image, set the crop, and tune the alpha.

Manual processing in Photoshop is tedious and error-prone across 75
entries (each needing identical resolution, identical metadata fields,
identical export settings). A purpose-built tool collapses the friction.

## Goals

- Walk through the 75-entry Famous catalogue galaxy by galaxy, letting
  the maintainer paste a source URL (or drag a local file), crop on
  canvas, tune StarNet + alpha sliders, and export an image trio with
  one click.
- Produce four committed artefacts per curated galaxy: a cropped
  source, a starless intermediate, a full-resolution alpha-WebP, and an
  atlas-sized alpha-WebP — sized for the eventual renderer-side
  close-approach pass without blocking on it.
- Persist enough metadata per galaxy (`recipe.json`) that the artefacts
  can be regenerated from the same source URL + parameters if our
  StarNet or alpha algorithms change.
- Override the automated `fetchFamousImages` pipeline for curated
  galaxies, so the next `fetchFamousImages` run skips them entirely.
- Keep the tool local-only and ephemeral: no auth, no DB, no deploy
  — a Vite dev server on port 5200, killed when the maintainer is done.

## Non-goals

- **Renderer-side close-approach full-resolution pass.** The curator
  produces `full.webp` at 1024² so the renderer can later swap the
  atlas-sampled slot for a standalone texture binding when a galaxy
  fills enough screen, but that swap is a separate spec + plan.
- **Atlas slot enlargement.** Curated galaxies feed the existing 128²
  atlas slot via `atlas.webp` (256² source, downsampled at upload).
- **HDR pipeline (16-bit storage, FITS sources, asinh stretch).**
  Killed by the source-availability investigation in the 2026-05-17
  spike — see `MEMORY.md` if context is needed. Pipeline stays 8-bit.
- **Automated source discovery** (AstroBin scraping, image search APIs).
  Maintainer pastes URLs.
- **Rotation, non-square crop, multiple curated images per galaxy.**
  All add complexity without a use case for thumbnail tiles.
- **Bulk re-processing.** If algorithms change, the maintainer re-runs
  per-galaxy from the recipe; we may add a "re-process all" button
  later but not v1.
- **Browser auth / multi-user.** Local-only tool.

## Approach

A single Vite dev server hosts both the React UI and the API endpoints,
attached via Vite's `configureServer` plugin hook. One process, one
port (5200), one terminal. The API is just a handful of POST / GET
routes that fetch source images, run StarNet + sharp processing, and
write the trio to disk.

### Why a single Vite server, not a separate Express service

Two reasonable options:

- **Single Vite server, API via `configureServer` middleware.** Chosen.
  Vite's plugin API attaches Express-compatible middleware that
  persists across HMR. The StarNet binary spawn works identically from
  a Vite plugin as from a standalone Express app, and the API is still
  hittable via curl for testing.
- **Separate Express on a second port, proxied by Vite.** Rejected.
  Adds a second process to manage, a second terminal to watch, and the
  "API survives UI reloads" argument that justifies the split isn't
  actually true — Vite middleware also persists across HMR. The
  separation buys nothing for a 5-endpoint local dev tool.

### File layout

```
tools/famous-curator/
  package.json          — separate from skymap's root if any dev deps
                          need to be isolated; otherwise a sibling
                          tsconfig + a npm script in root suffices
  vite.config.ts        — Vite + plugin entry; sets port=5200
  plugin/
    apiPlugin.ts        — configureServer wrapper, attaches routes
    routes/
      fetch.ts          — POST /api/fetch
      process.ts        — POST /api/process
      export.ts         — POST /api/export
      galaxies.ts       — GET  /api/galaxies
    starnet.ts          — promisified spawn; reuses spike's binary
                          discovery + cwd handling
    paths.ts            — repo-root + curated-dir resolution
  ui/
    index.html
    main.tsx            — React shell, single page
    App.tsx
    components/
      GalaxyList.tsx
      CropCanvas.tsx
      ParamSliders.tsx
      PreviewPane.tsx
      MetadataForm.tsx
    state.ts            — Zustand or useReducer; in-memory only
    api.ts              — typed fetch wrappers for /api routes
  README.md             — how to run + install StarNet2
```

Tests live in `tests/tools/famous-curator/` mirroring this tree, same
convention as the existing famous-galaxy tests.

### API surface

All endpoints under `/api`, JSON bodies unless noted.

**`GET /api/galaxies`** — returns the 75 seed entries augmented with a
`curated: boolean` flag derived from
`data/famous_curated_overrides.json`. The UI uses this to populate the
left-panel galaxy list and render done-state checkmarks.

**`POST /api/fetch`** — body is either `{ "url": "https://..." }` (URL
download path) or a multipart upload (drag-drop path). Downloads /
receives the source image, stores it in a session-scoped tmpdir,
returns:

```
{
  "tmpId": "abc123",
  "width": 4027,
  "height": 4174,
  "previewUrl": "/api/preview/abc123/source.webp",
  "mediaType": "image/jpeg"
}
```

URL downloads reject if the response is non-image or larger than 50 MB
(the maintainer should download manually and drag-drop in that case).

**`POST /api/process`** — body:

```
{
  "tmpId": "abc123",
  "crop": { "x": 100, "y": 200, "width": 1820, "height": 1820 },
  "starnet": { "stride": 256, "upsample": false },
  "alpha": { "blackPoint": 8, "whitePoint": 230, "gamma": 0.7 }
}
```

Crops the source, runs StarNet on the cropped region (8-15 s), applies
the alpha pass via `applyLuminanceAsAlpha`, returns:

```
{
  "starlessPreviewUrl": "/api/preview/abc123/starless.webp",
  "alphaPreviewUrl":    "/api/preview/abc123/alpha.webp"
}
```

Preview WebPs are written to the same tmpdir at preview resolution
(512² for the canvas) and served via a `/api/preview/:tmpId/:name`
route. The full-resolution output is generated only at Export time.

**`POST /api/process/alpha-only`** — body same as `/api/process` minus
the `starnet` field. Re-runs only the alpha pass against the cached
starless PNG in the tmpdir. Returns just `alphaPreviewUrl`. Enables
live alpha-slider preview without re-running StarNet.

**`POST /api/export`** — body:

```
{
  "id": "m31",
  "tmpId": "abc123",
  "crop": { ... },
  "starnet": { ... },
  "alpha": { ... },
  "metadata": {
    "sourceUrl": "https://www.astrobin.com/...",
    "license": "CC-BY-SA-4.0",
    "author": "Niall MacNeill"
  }
}
```

Atomic write: stages all four output artefacts + `recipe.json` to
`public/images/famous-curated/<id>/.tmp/`, then renames the directory
into place. Updates `data/famous_curated_overrides.json` with the new
entry. Returns the final paths plus the updated override index for the
UI to refresh.

### Output layout

```
public/images/famous-curated/m31/
  source.webp     — lossless WebP, cropped, 1024², ICC preserved
                    (~1-2 MB)
  starless.webp   — lossless WebP, post-StarNet, 1024², ICC preserved
                    (~1-2 MB)
  full.webp       — lossy WebP q92, 1024² with alpha
                    (~300-700 KB; renderer close-approach pass)
  atlas.webp      — lossy WebP q82, 256² with alpha
                    (~30-80 KB; atlas slot)
  recipe.json     — ~1 KB
```

**Why four files**:

- `source.webp` is archival evidence of exactly what was processed.
  URLs rot; pixels survive. Lossless because we may want to re-crop or
  re-process later without going back to the URL.
- `starless.webp` caches the StarNet output, so the maintainer can
  re-tune alpha without paying the 8-15 s StarNet cost per change.
- `full.webp` is the renderer's close-approach asset (when that pass
  ships). Lossy q92 is visually indistinguishable from lossless at
  WebP's encoder quality.
- `atlas.webp` is the immediate runtime asset. q82 matches what
  `fetchFamousImages` already writes for the auto-fetched WebPs, so
  the atlas keeps a uniform compression aesthetic.

Per-galaxy footprint: ~2.5-4.5 MB. For 75 galaxies: **~200-340 MB**.
Material but acceptable — comparable to a single `glade-large.bin`
which is also gitignored for size reasons. We commit the WebPs to git
because they're hand-curated artefacts the repo should own, and
because the existing `public/images/famous/` heroes are already tracked
the same way.

### Why WebP, not AVIF

AVIF would be a logical choice if we were targeting 10/12-bit per
channel for HDR. We aren't (HDR is parked — see Non-goals). At 8-bit:

- **Encode/decode**: WebP is 5-10× faster. Material in the curator UI
  where every Process click re-encodes.
- **Viewer support**: WebP renders in Photoshop, Preview, and every
  browser without configuration. AVIF needs recent Photoshop (24+) or
  a plugin.
- **Codebase parity**: `fetchFamousImages` and the runtime atlas
  already use WebP. One format across the pipeline.

Size win for AVIF over WebP at lossless mode is in the 5-10% range,
not enough to outweigh the friction.

### Runtime integration

Two stages, separable:

**Build-time** (`fetchFamousImages.ts` change, in scope for this spec):

- Load `data/famous_curated_overrides.json` at startup.
- For any seed entry with an override, skip the Wikipedia / DESI chain
  entirely. Instead, copy
  `public/images/famous-curated/<id>/atlas.webp` to
  `public/images/famous/<id>.webp` (the path the runtime atlas loader
  already reads).
- Log "curated" instead of "wikipedia" / "desi" for those entries.
- Idempotent: re-running `fetchFamousImages --force` overwrites both
  the curated copy and the cache JSON, so a curator update is visible
  on the next fetch run.

**Runtime close-approach pass** (renderer change, **out of scope**):

- When a galaxy's `apparentSizePx` crosses a threshold, the engine
  loads `public/images/famous-curated/<id>/full.webp` and binds it as
  a standalone texture for that quad's draw call.
- For galaxies with no curated override, this code path doesn't
  activate.
- Specified separately when we're ready to do the renderer work.

### Override index

`data/famous_curated_overrides.json`:

```
{
  "version": 1,
  "entries": {
    "m31": {
      "dir": "famous-curated/m31",
      "sourceUrl": "https://www.astrobin.com/...",
      "license": "CC-BY-SA-4.0",
      "author": "Niall MacNeill",
      "processedAt": "2026-05-18T14:32:01Z"
    }
  }
}
```

Tracked in git via an allowlist exception in `.gitignore`:

```
!/data/famous_curated_overrides.json
```

Same pattern as the existing `!/data/famous_galaxies.seed.json` line.
Small enough to render in a PR diff. The `author` and `license` fields
surface at runtime later if we ever want a credit panel.

### Crop UX

Free-form rectangle drag on canvas, **aspect ratio locked to 1:1**
(outputs are square). Behaviour:

- Corner handles resize symmetrically; edge handles resize along one
  axis (still maintaining square via the opposite edge moving in
  sync).
- Body drag translates the crop.
- Canvas zoom slider for accurate positioning on large sources (~4000²
  inputs at canvas width ~800px need zoom + pan).
- "Reset crop" button → centred, 80% of min dimension.
- Live readout: "crop 1820 × 1820 of 4027 × 4174 source".

No rotation, no free aspect ratio. Both add complexity for no use case
in galaxy thumbnails (they're presented as square atlas tiles either
way).

### Parameter UI

Two vertical sections beneath the canvas:

**StarNet**
- `stride`: slider 16-512, snap-to-power-of-2 (128, 256, 512).
  Default 256.
- `upsample`: checkbox. Default off.
- (Hidden behind "advanced") `weightsPath`: text input. Defaults to
  whatever the server resolved from `STARNET_WEIGHTS`.

**Alpha**
- `blackPoint`: slider 0-50. Default 8.
- `whitePoint`: slider 180-255. Default 255.
- `gamma`: slider 0.3-2.0 (log-scaled on the slider track). Default 0.7.

Defaults match the spike's empirically-tuned values for ESO / Hubble
press-kit sources after StarNet.

### Process flow + preview behaviour

- Changing crop or any StarNet param marks the preview "dirty" — UI
  shows an orange dot on the Process button.
- Clicking **Process** runs the full crop + StarNet + alpha pipeline.
  8-15 s spinner. The starless intermediate is cached server-side
  against `tmpId`.
- Changing alpha sliders triggers `POST /api/process/alpha-only`,
  which re-runs only the (instant, < 1s) alpha pass against the
  cached starless. UI shows a live preview without re-running StarNet.
- Export button is disabled until at least one Process has completed
  with the current crop + StarNet params (i.e., alpha changes after
  Process are fine; crop or StarNet changes require re-Process).

### Per-galaxy workflow

1. Maintainer clicks a galaxy in the left list. Done galaxies show a
   green check.
2. Paste a source URL in the source bar, OR drag a local file onto
   the canvas. Server downloads / accepts the file, canvas shows the
   source.
3. Drag the crop box. Fill in license + author fields (required for
   Export).
4. Adjust StarNet sliders → click **Process** → spinner.
5. Adjust alpha sliders → live preview in the right pane.
6. Click **Export** → trio + recipe.json written to
   `public/images/famous-curated/<id>/`, override index updated,
   galaxy gets a green check in the left list.
7. Click the next galaxy.

Resumable: re-clicking an already-exported galaxy loads its
`recipe.json` back into the sliders + reconstructs the crop box, so
tweaks don't require re-curating from scratch. The source URL is
re-fetched (we don't cache the original between sessions, only the
cropped derivative).

### Error handling

- **URL 404 / non-image response** → server returns 400 with reason;
  UI shows toast, canvas stays on previous source.
- **Source > 50 MB** → server returns 413; UI suggests drag-drop.
- **StarNet binary missing** → server fails at boot with the same
  install-hint error the spike uses. UI shows "server unavailable"
  state.
- **Export disk-write fails mid-trio** → atomic rename guarantees
  partial trios never end up in `public/images/famous-curated/<id>/`.
  The `.tmp/` staging dir is cleaned up on retry.
- **Invalid metadata** (missing license, missing author) → Export
  button disabled; tooltip explains.

### Testing

- **Pure helpers** (crop math, recipe-JSON serialisation,
  override-index update logic): vitest, mirrors existing
  `famousImageProcessor` test style. Located in
  `tests/tools/famous-curator/`.
- **API endpoints**: vitest integration tests with `MOCK_STARNET=1`
  env var. The mock is a copy-input-to-output shim (the spike already
  discovered the real binary's quirks; we don't need to re-test the
  binary itself in CI). Tests cover: download path, crop math
  round-trip, export atomicity, override index update, error returns.
- **UI smoke test**: one Playwright test — load galaxy list, click an
  entry, paste a known-good URL, set a crop, mock-process, mock-export,
  assert the trio appears on disk. Run locally; not in CI (CI doesn't
  have StarNet).
- **Real StarNet binary integration**: manual, like the DisPerSE
  integration. The README documents how to install and verify.

## Open questions

None blocking. Things worth deciding during implementation:

- **Zustand vs `useReducer`** for UI state. Zustand if the state graph
  feels deep (galaxy list + active edit + preview cache + override
  map); `useReducer` if it stays flat. Defer to implementation.
- **React vs vanilla**. React is the project standard. If a contributor
  wanted to argue for vanilla DOM + lit-html for a smaller dep
  footprint, the curator is contained enough that the choice is
  reversible — but no compelling reason to deviate.
- **npm script name**: `npm run curate-famous` or `npm run curator`?
  Bikeshed at implementation time.

## Future work (separate specs)

1. **Renderer close-approach pass** — load `full.webp` as a standalone
   texture binding when `apparentSizePx > threshold`. Engine + shader
   change. Probably the most impactful follow-up; it's what makes the
   1024² investment pay off visually.
2. **Bulk re-process** — UI button to re-export all curated galaxies
   with current algorithm versions. Useful if we tune StarNet defaults
   or change alpha formula.
3. **Attribution panel** — surface `author` + `license` from the
   override index in the InfoCard or a per-galaxy credits modal.
4. **Multiple curated images per galaxy** — different telescopes /
   orientations, swappable in settings. Punted; YAGNI until requested.
