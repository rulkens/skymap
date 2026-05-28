# Famous-galaxy high-resolution LOD — design

> **Scope.** Second of three specs splitting the "famous-galaxy thumbnail
> quality" backlog. Issue #1 (procedural-disk fade-out) shipped earlier
> on 2026-05-28; this spec covers Issue #2 (sharper thumbnails on close
> approach). Issue #3 (in-app calibration) is a separate brainstorm.
> **Status.** Brainstormed 2026-05-28, ready to plan.
> **Companion ADR.** [`docs/adrs/0002-tiered-thumbnail-textures.md`](../../adrs/0002-tiered-thumbnail-textures.md)
> records the directional choice (layered high-res textures, not a
> second atlas, not per-galaxy bind groups).

## Problem

The runtime ships a single 128 × 128 atlas tile per famous galaxy
(`public/images/famous/<id>.webp`, downsized from the curator's 256 × 256
`atlas.webp` at decode time). When the camera flies close enough that
the galaxy fills a substantial fraction of the screen — apparent
diameter past ~200 px — the 128 px tile is visibly soft. The curator
already emits a 1024 × 1024 `full.webp` for 52 of the 75 famous
galaxies (in `public/images/famous-curated/<id>/full.webp`), but the
runtime currently has no way to consume it: the texture atlas has
fixed 128 px slots and a 4096² × 4-byte atlas to hold 256 slots of
1024 px would be 256 MB GPU — well over budget.

## Goal

When the camera approaches a famous galaxy whose `full.webp` is
available, fade in a 1024 × 1024 bespoke texture (512 × 512 on the
mobile tier) over the standard atlas tile so the photo stays sharp.
Smooth crossfade across an apparent-diameter band — no atomic pop at
fetch-ready. Bounded GPU memory (≤32 MB additional). Graceful fallback
for galaxies without a `full.webp`.

## Approach: `texture_2d_array` with N=8 layers

A single `texture_2d_array` holds the high-resolution textures: 8
layers, each layer dim = tier-aware (`HI_RES_LAYER_SIDE`).

| Tier | Layer dim | Memory (8 layers × 4 bytes) |
|---|---|---|
| Mid / High | 1024 × 1024 | 32 MB |
| Mobile | 512 × 512 | 8 MB |

The runtime fetches `full.webp` from R2 at
`dataUrl('images/famous-hires/<id>.webp')` when the apparent diameter
crosses the trigger threshold, `createImageBitmap`-resizes to
`HI_RES_LAYER_SIDE`, and uploads into the next free layer via
`copyExternalImageToTexture` with the layer index in the destination
origin's `z` coordinate.

### Why R2 (not Workers Assets)

Same architecture split as the `.bin` files (`CLAUDE.md` § "Deploy
workflow"): small static shell on Cloudflare Workers Assets, large
binary blobs on R2 for zero egress + no per-file size cap. Per-galaxy
`full.webp` files are ~400 KB × 75 ≈ 30 MB total — squarely in the
R2-blob bracket, and the existing `dataUrl()` helper + CORS rules
already cover this path with no new infrastructure.

A per-instance `hiResLayerIdx: i32` attribute on the textured-disk
instance buffer carries the layer index for galaxies with an active
high-res slot. The sentinel `-1` (or any negative value) means "use
the standard atlas tile only, no high-res sample." Fragment shader
samples the array layer, blends with the atlas-tile sample using a
per-instance crossfade alpha, and emits the result.

### Why `texture_2d_array` (not a second atlas, not per-galaxy bind groups)

See ADR 0002 for the full reasoning. In short: the array gives each
galaxy a full (0, 0) - (1, 1) UV space (no atlas slot UV math),
keeps the bind-group count at one (so the textured-disk pipeline
stays at one draw per pass), and lets the layer dim be a constructor
arg so tier-awareness drops out naturally.

## Trigger and crossfade

| Apparent diameter | Behavior |
|---|---|
| < 200 px | Standard atlas tile only. `hiResLayerIdx = -1`. |
| 200 → 260 px (crossfade band) | Both layers render. Crossfade alpha smoothly ramps the high-res in (0 → 1) and the atlas tile out (1 → 0). |
| > 260 px | High-res only. Atlas tile is fully transparent on this disk. |

The band is well above the standard texturedDisks fade-in band
(24 → 40 px). The atlas tile owns the disk by itself across the
entire 40 → 200 px range, so the user clearly perceives the
standard tile first; the high-res swap only kicks in when the disk
is large enough that the 128 px atlas tile is unmistakeably soft.

The crossfade alpha lives on the same instance buffer the textured-disks
pass already uses, computed CPU-side in `texturedDiskSubsystem.ts`
each frame from `apparentSizePx` and `hiResLayerIdx` state — same
pattern as the proc-disk fade-out spec we just shipped.

## Components touched

- **New: `src/services/gpu/resources/hiResFamousTexture.ts`**
  Owns the `texture_2d_array` GPU resource, the layer-slot bookkeeping
  (key → layer-index map), and the LRU policy. Parameterised by
  `layerSide: number` so the mobile / mid / high tiers all use the
  same class with different constructor args.
- **New: `src/services/engine/subsystems/hiResFamousSubsystem.ts`**
  Per-frame planner. Walks the catalog (Famous source only), gates on
  apparent diameter ≥ 100 px, enqueues fetches for galaxies not yet
  in the array, computes the crossfade alpha for galaxies in the
  100 → 160 band, and emits the per-instance `hiResLayerIdx` +
  crossfade-alpha values for `texturedDiskSubsystem` to fold into
  its instance buffer.
- **`src/@types/rendering/DiskInstance.d.ts`** — add `hiResLayerIdx: number`
  (default −1) and `hiResCrossfadeAlpha: number` (default 0). The
  current per-instance pack has only one unused float (`orient.w`),
  so the stride grows 12 → 16 floats (48 → 64 bytes) and a new
  `@location(3)` vertex attribute carries the 4-float trailer. The
  shared `instancedQuadRenderer` factory feeds all three consumers
  (quads, textured disks, procedural disks) — only the textured-disk
  shader reads the trailer; the other two ignore it.
- **`src/services/gpu/renderers/texturedDiskRenderer.ts`** — declare
  the new vertex attributes; add a second `@group(0) @binding(_)`
  for the `texture_2d_array` and matching sampler; encode the new
  per-instance fields into the existing instance buffer.
- **`src/services/gpu/shaders/texturedDisks/{io,vertex,fragment}.wesl`** —
  declare the new array binding, plumb `hiResLayerIdx` +
  `hiResCrossfadeAlpha` through `VsOut`, sample the array layer in
  the fragment stage (gated by `hiResLayerIdx >= 0`), blend with the
  existing atlas tile via the crossfade alpha.
- **`src/utils/network/galaxyImageFetcher.ts`** — extend the famous
  branch to optionally fetch the `full.webp` URL when called with a
  new flag (e.g. `fetchHiRes: true`). Reuses the existing
  `createImageBitmap`-resize path.
- **`src/services/engine/subsystems/texturedDiskSubsystem.ts`** —
  thread the hi-res subsystem's per-galaxy state (layer index +
  crossfade alpha) into the instance buffer for each emitted disk.
- **`src/services/engine/phases/wireSlots.ts`** — instantiate the
  hi-res-famous texture + subsystem at engine bootstrap. Pass the
  tier-derived `layerSide` from the active source-set config (the
  small / medium / large tier the user has selected).
- **`src/data/sources.ts`** — define `HI_RES_LAYER_SIDE_BY_TIER`
  constants (512 / 1024 / 1024 for small / medium / large) and
  `HI_RES_LAYER_COUNT = 8`.
- **New build step** in `tools/famous/` (or as a post-process on the
  curator) that copies each `public/images/famous-curated/<id>/full.webp`
  → `public/data/images/famous-hires/<id>.webp`. Flat layout so R2 path
  rewriting isn't needed; `public/data/images/famous-hires/` joins
  `public/data/` in `.gitignore` as a build artifact. Idempotent.
- **`tools/deploy/syncR2.ts`** — extend the ALLOW filter to include
  `images/famous-hires/*.webp`. Same Cache-Control + CORS treatment
  as the `.bin` files (no changes needed; R2 CORS already permits
  the production / dev origins for any path).
- **`src/utils/network/dataUrl.ts`** (or the equivalent helper) —
  no API change; the helper always prepends `/data/`, so the call
  is `dataUrl('images/famous-hires/<id>.webp')` and the R2 key has
  to be `data/images/famous-hires/<id>.webp` (production →
  `https://skymap-data.rulkens.com/data/images/famous-hires/<id>.webp`;
  dev → relative `/data/images/famous-hires/<id>.webp` served from
  the local `public/data/` directory). The build step + syncR2 ALLOW
  filter both target the `data/images/famous-hires/` prefix.
- **No changes** to the curator (`tools/famous-curator/`) itself,
  the `.bin` format, or the catalog pipeline.

## Data flow

1. Engine per-frame loop computes `apparentSizePx` for each Famous-source
   galaxy as usual.
2. The hi-res-famous subsystem (running alongside texturedDiskSubsystem
   in the LOD-2 phase) gates on `apparentSizePx ≥ 200`. For each
   such galaxy:
   - If not already in the array: allocate a layer slot (LRU evict
     the layer whose galaxy has the smallest recent-apparent-diameter
     if all 8 are full), enqueue a fetch for
     `dataUrl('images/famous-hires/<id>.webp')` via the existing
     galaxyImageQueue priority system.
   - If already in the array: record the current apparent diameter
     so LRU has a recency signal.
   - Compute crossfade alpha: `smoothstep(200, 260, apparentSizePx)`
     for the 200 → 260 band, 1.0 above 260, 0 below 200.
3. The fetch resolves; `copyExternalImageToTexture` uploads the
   bitmap to the allocated layer; the subsystem records "this layer
   is ready" so the renderer starts sampling.
4. texturedDiskSubsystem builds its per-frame disk instances. For
   each Famous-source galaxy, it reads the hi-res subsystem's
   per-galaxy state and writes `hiResLayerIdx` + `hiResCrossfadeAlpha`
   into the instance attributes (defaults to -1 / 0 if no high-res
   slot allocated).
5. texturedDiskRenderer draws all disks in one pass. The fragment
   shader samples the atlas tile and (if `hiResLayerIdx ≥ 0`) the
   array layer, blends them by the crossfade alpha, and emits the
   final colour.

## Edge cases

- **Galaxy with no `full.webp`**: the
  fetch resolves to null; the layer-slot allocation is rolled back;
  `hiResLayerIdx` stays at -1 for that galaxy across all apparent
  diameters; renderer falls through to atlas-tile-only rendering
  unchanged. Optionally a one-time dev-mode `console.warn` lists the
  uncovered IDs so curator coverage gaps are visible.
- **LRU eviction during crossfade**: if a galaxy is mid-crossfade
  (alpha in (0, 1)) and another galaxy displaces its layer, the
  crossfade alpha drops to 0 abruptly on the next frame — atlas tile
  becomes solely visible. Acceptable: with N=8 layers and a typical
  fly-in pattern, mid-crossfade eviction is rare; the visual artefact
  is "the photo briefly snaps back to lower-res," which the user
  perceives as a momentary quality drop, not a black gap.
- **Rapid in-out fly-by**: galaxy crosses 200 px briefly, fetch
  starts, user pulls away before fetch completes. The fetch finishes,
  uploads to the layer, but `apparentSizePx` is already back below
  200 → crossfade alpha is 0, no waste beyond the bandwidth.
  Acceptable.
- **Mobile tier with smaller layer dim**: the 1024 px source is
  resized to 512 at decode time via `createImageBitmap`'s
  `resizeWidth` / `resizeHeight`. No separate file needed. Bandwidth
  unchanged — still downloads the 1024 px file — but the user
  consciously chose the smaller tier so the bandwidth budget is on
  them.
- **Tier change at runtime**: if the user switches tiers
  (e.g. medium → small), the `layerSide` parameter changes but the
  existing texture is fixed dim. Treatment: destroy the existing
  hi-res-famous texture + subsystem and recreate at the new
  `layerSide`. All in-flight layer slots are discarded. The user
  perceives a brief loss of high-res on visible famous galaxies,
  which refetch + reload in the new dim. Acceptable for an explicit
  user action.

## Tier-aware sizing

| Source-set tier | `HI_RES_LAYER_SIDE` | Memory (N=8) |
|---|---|---|
| small (mobile) | 512 | 8 MB |
| medium | 1024 | 32 MB |
| large | 1024 | 32 MB |

(`small` is the existing mobile-leaning tier; the choice to peg
mobile to 512 reflects the lower GPU memory budget on mobile devices,
not bandwidth — the bandwidth is fixed by the 1024 px source.)

## Scope

**In scope:**

- `texture_2d_array` GPU resource at the tier-derived `layerSide`.
- N=8 layer cap with LRU eviction.
- 100 → 160 px crossfade band.
- Famous-source-only — SDSS / DSS unchanged.
- R2-hosted fetch at `dataUrl('images/famous-hires/<id>.webp')`;
  flat layout produced by a build step that copies from the curator's
  `public/images/famous-curated/<id>/full.webp` source of truth.
- Graceful fallback for the 23/75 famous galaxies without `full.webp`.
- Tier-aware `layerSide` plumbing through wireSlots.

**Explicitly out of scope:**

- Re-curating the 23/75 famous galaxies missing `full.webp`. The
  graceful fallback covers them; coverage expansion is a curator
  task tracked separately.
- Equivalent high-res tier for SDSS / DSS. Their cutout services
  don't return materially-sharper images at the same field-of-view;
  the cutout-quality memory items track that separately.
- StarNet-processed (`starless.webp`) rendering as a third visual
  mode. Independent feature.
- Re-hosting on Workers Assets instead of R2. The R2 split mirrors
  the existing `.bin` deploy and gets zero-egress + no per-file cap
  for the same cost-of-thought as bundling them with the shell.
- ADR 0002's full architectural commitment — captured in that ADR,
  not duplicated here.

## Testing

- **Unit:** `hiResFamousTexture` round-trips layer allocation /
  release / LRU eviction. Fake GPUDevice mock as elsewhere.
- **Unit:** `hiResFamousSubsystem` emits `hiResLayerIdx = -1` for
  apparent diameter < 200, and a non-negative index in the 200 →
  260 band when the layer is ready. Stub fetch for determinism.
- **Unit:** crossfade alpha matches the smoothstep at boundary +
  midpoint pins (200 px → 0, 230 px → 0.5, 260 px → 1).
- **Unit:** N=9 distinct famous galaxies in the trigger band over
  consecutive frames → LRU evicts the smallest-recent-apparent
  layer, not a random one.
- **Visual smoke (manual):** fly to M31; confirm sharper detail
  resolves as apparent diameter crosses ~230 px, no pop at fetch
  ready, fly away and confirm the atlas tile resumes ownership at
  smaller apparent size.
- **Visual regression (manual):** fly to an SDSS-only galaxy; confirm
  current rendering behaviour is unchanged (high-res tier is famous-
  only).

## References

- ADR 0002 — Tiered thumbnail textures (companion to this spec).
- `src/services/gpu/resources/textureAtlas.ts` — current atlas
  layout the new tier sits alongside.
- `src/utils/network/galaxyImageFetcher.ts:42-54` — current famous
  branch (extend for `full.webp` URL).
- `public/images/famous-curated/<id>/full.webp` — curator's source of
  truth; build step copies to `public/data/images/famous-hires/<id>.webp`
  which `syncR2.ts` ships to the bucket as `data/images/famous-hires/<id>.webp`.
- `tools/deploy/syncR2.ts` — extend ALLOW filter for the new path.
- `CLAUDE.md` § "Deploy workflow" — the Workers-Assets-vs-R2 split
  this spec extends.
- `tools/famous/famousImageProcessor.ts` — curator that produces
  the source files. Not modified by this spec.
- The 2026-05-28 procedural-disk fade-out spec
  (`docs/superpowers/specs/completed/2026-05-28-procedural-disk-fade-out-design.md`)
  is the immediate sibling — it introduced the per-instance
  crossfade pattern this design reuses.
- Project memory `project_thumbnail_quality` — historical context
  on the broader thumbnail-quality backlog.
