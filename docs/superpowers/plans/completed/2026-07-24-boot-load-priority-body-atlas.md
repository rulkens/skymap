# Boot load priority — part 2: the body-texture atlas

**Spec:** [`docs/superpowers/specs/completed/2026-07-24-boot-load-priority.md`](../../specs/completed/2026-07-24-boot-load-priority.md) §3.
**Part 1:** [`2026-07-24-boot-load-priority.md`](2026-07-24-boot-load-priority.md). Its Phase 0
prep (P3 residency, P4a/P4b placeholder layers) is a hard precondition for everything here.
Do not start part 2 before part 1's Phase 2 has landed.

## Goal

Body textures are proximity-gated on the live camera (`assetWiring.ts:200-217`), so a body
reached before its texture lands draws through `planetRenderer` as a flat albedo sphere.
Rather than predicting where the camera is going, ship ONE low-resolution surface tile for
every textured body in a single ~200 KB atlas, fetched first (priority 0), so every body always
has something to show.

## Architecture

The atlas is a TRANSPORT format, not a sampling format. Tiles are cropped out of the one
decoded bitmap into each body's existing per-body GPU texture at upload, so there is no shader
change, no binding change, no uniform change, no UV remap, no seam gutters, and no iOS
shader-validation exposure. The atlas itself never becomes a bound texture.

Each tile lands in its renderer's PLACEHOLDER layer (part 1's P4a/P4b), never its committed-map
layer. That is what makes an out-of-order arrival harmless: a hi-res map that landed first
shadows the tile automatically, with no slot-state peek in the commit path (which would
re-braid the loading fact into the rendering path P3 just un-braided).

For agentic workers: REQUIRED SUB-SKILL superpowers:subagent-driven-development. Each task ends
with its own scoped commit. These are all FEATURE commits; part 1 carries the prep.

## Contract facts (verified against source, 2026-07-24)

- `BODY_TEXTURE_REGISTRY` (`src/data/bodies/bodyTextureRegistry.ts:50-101`) has 13 bodies. Its
  docblock states it is deliberately the ONLY enumeration of the textured-body set. Atlas
  membership DERIVES from it. Do NOT introduce a hand-maintained parallel list.
- All 13 surfaces are 2:1 equirectangular, so every tile is the same 512x256 and the atlas is a
  uniform 4-column grid: 4 columns x 4 rows at 2048x1024, with 3 cells unused.
- `textureBuildEntries()` (`tools/textures/buildTextures.ts:427-434`) already flattens the
  registry to `(bodyId, kind)` pairs in registry order. Filtering it to `kind === 'surface'`
  gives exactly the 13 atlas members with no second enumeration.
- The ring is NOT in the atlas (spec Ground preparation, ring-drop decision 2026-07-24). It is
  2048x125, its content is its alpha, and its full tier is only 8,832 bytes.
  `commitBodyTexture`'s `'saturn-ring'` routing (`bodyTextureSlotRegistry.ts:103-115`, three
  consumers) is untouched by this feature. `ringRenderer` and `atmosphereShellRenderer` gain
  nothing here.
- `emittedTiersForBody` returns a prefix of `['small','medium','large']`, so EVERY body emits a
  `small` (2048 px) surface tier. `bodyTextureFilename(bodyId, 'surface', 'small')` is
  `<bodyId>-2048.jpg`.
- `buildTextures.ts:440-461` skips a body whose source is missing on disk (a `--dev` fetch, a
  fresh clone). The atlas pass must tolerate a missing tile rather than crash or shift indices.
- `installSlots.ts:64` writes any non-body-texture string key straight to
  `state.assetSlots[key]`; `slotFor.ts:68` reads it back; `installLoadProgress.ts:70-74` walks
  `ASSET_WIRING`'s string keys into `allSlots`. All three widen for free once
  `'bodyTextureAtlas'` is an `AssetKey` member and a named `EngineAssetSlots` field.
- `isBodyTextureKey` (`src/utils/scene/isBodyTextureKey.ts`) tests membership in the composite
  `bodyId:kind` set, so `'bodyTextureAtlas'` correctly falls through to the named-field branch.
- `dataUrl(filename)` is `src/services/loading/fetchWithProgress.ts:24-27`.
- `bodyTextureFetcher` (`src/services/loading/fetchers/bodyTextureFetcher.ts`) is the shape to
  mirror: `dataUrl(...)` fetch, `res.ok` guard, `res.blob()`, `createImageBitmap`.
- `famousStars.generated.ts:1-5` is the generated-file header precedent: path line, DO NOT EDIT
  line, "Regenerate with" line, "Source of truth" line.

## Standing test refusal (carried from part 1)

Nothing in this part earns a test. Per the spec's "Testing" section and
`docs/superpowers/conventions/testing.md`:

- **Atlas pixel correctness** needs a GPU; it is covered by the visual check in task 4.2.
- **`BODY_ATLAS_LAYOUT` covering every registry body** is enforced by its
  `Record<BodyTextureId, number>` type. A test would restate a compiler check.
- **`atlasTileRect`'s arithmetic** is a three-line formula that cannot break independently of
  its inputs.

A future implementer who adds one of these should delete it again.

---

## Phase 3 — the body-texture atlas

### 3.1: `AtlasTileRect` type + `atlasTileRect` util

**Files:** `src/@types/data/AtlasTileRect.d.ts` (new, ONE type),
`src/utils/gpu/atlasTileRect.ts` (new, ONE function)

**Contract:**

```ts
// src/@types/data/AtlasTileRect.d.ts
export type AtlasTileRect = { x: number; y: number; w: number; h: number };

// src/utils/gpu/atlasTileRect.ts
export function atlasTileRect(
  index: number,
  columns: number,
  tileSize: { w: number; h: number },
): AtlasTileRect;
```

Row-major: `x = (index % columns) * tileSize.w`, `y = floor(index / columns) * tileSize.h`,
`w`/`h` from `tileSize`. Didactic header stating WHY this exists as a function at all rather
than the layout carrying explicit rects: the ring's off-grid 2048x125 strip once forced
per-tile `{x,y,w,h}`, and dropping the ring restored a uniform grid, so the rect derives from
the index alone and `setPlaceholderMap`'s signature stays rect-shaped for a future non-uniform
atlas.

- [x] No test (see the standing refusal above).
- [x] Write both files.
- [x] `npm run typecheck` clean.
- [x] Commit: the two files above.

### 3.2: build emission + generated layout

**Files:** `tools/textures/writeBodyAtlas.ts` (new),
`tools/textures/buildTextures.ts` (modify, `buildTextures` at `:437-476`),
`src/data/bodies/bodyAtlas.generated.ts` (new, generated output committed to the repo),
`public/data/images/textures/body-atlas.webp` (new, build artefact)

The atlas is emitted by the EXISTING body-texture build tool (`npm run build-textures`), not a
standalone script. Q19 decided this on the drift failure mode: a forgotten atlas rebuild after
re-curating Mars produces a subtly wrong planet with no error anywhere. Coupling atlas emission
to tier emission makes staleness structurally impossible.

**Contract:**

```ts
// src/data/bodies/bodyAtlas.generated.ts  (GENERATED)
export const BODY_ATLAS_LAYOUT: Readonly<Record<BodyTextureId, number>>; // body -> tile index
export const BODY_ATLAS_GRID: { columns: number; tileW: number; tileH: number };
```

`BODY_ATLAS_GRID` rides the same generated file rather than a hand-written constant: the grid's
row-major order and cell size are facts the BUILD (assigning indices while iterating
`textureBuildEntries()`) and the RUNTIME (looking an index up by body id, deriving a rect) must
agree on. Stating them once in the generated file beats trusting both sides to independently
preserve `BODY_TEXTURE_REGISTRY`'s iteration order forever. Not a fetched JSON sidecar: a
sidecar means an extra round trip before the atlas is usable, which is precisely the latency
this feature removes.

**Emission shape:**

- Members = `textureBuildEntries().filter((e) => e.kind === 'surface')`, in registry order.
  Index `i` is that entry's position. This is the ONLY enumeration; no parallel list.
- Tile source: the `small` tier file this same run just wrote,
  `join(outDir, bodyTextureFilename(bodyId, 'surface', 'small'))`, resized to 512x256. Reading
  back the emitted file (rather than re-deriving from the raw source) means the tile is
  guaranteed to match what ships, tint and all, with no second tint path to keep in sync.
- **Missing tile:** a body whose source was absent is skipped by the main loop (`:441-444`) and
  has no `-2048.jpg`. Fill its cell with mid-grey `[128,128,128]` and warn on stderr. The index
  is still assigned, so indices never shift and `BODY_ATLAS_LAYOUT` stays total (its
  `Record<BodyTextureId, number>` type requires that).
- Encode: `.webp({ quality: 80 })`, plain opaque sRGB. The atlas chooses WebP for compression,
  NOT for alpha: with the ring dropped there is no transparency in it.
- Budget: hard 1 MB. Estimate is ~194 KB (the 2048-tier surface set is ~3.1 MB across the same
  13 files and 512 px is one sixteenth the pixels), but WebP's lossy overhead does not scale
  linearly with pixel count, so treat that as an estimate not a promise. Log the byte size and
  warn loudly above 1 MB.
- Codegen: write `src/data/bodies/bodyAtlas.generated.ts` with the four-line generated header
  copied in shape from `famousStars.generated.ts:1-5` (path, DO NOT EDIT, `Regenerate with:
npm run build-textures`, `Source of truth: src/data/bodies/bodyTextureRegistry.ts`).

Run the atlas pass AFTER the per-body loop and BEFORE the ring loop, so every `-2048.jpg` it
reads already exists.

- [x] No test. `textureBuildEntries()` already has coverage as the build's pure spine; the
      atlas pass is I/O plus a sharp composite, and its correctness is a pixel question the
      visual check in 4.2 answers.
- [x] Implement `writeBodyAtlas`; call it from `buildTextures`.
- [x] Run the atlas pass. 2048x1024, **161,334 bytes** (16% of the 1 MB budget), 13/13 tiles,
      no skips. A full `npm run build-textures` was NOT run here: this worktree carries no
      `data/raw/textures/` sources (~700 MB, gitignored) and no `public/data/`, so the pass ran
      against copies of the main checkout's already-built `*-2048.jpg` tiers — the same bytes a
      full run would have re-emitted.
- [x] Note for deploy: `public/data/images/textures/body-atlas.webp` is a build artefact that
      must ride the R2 sync before production (see `docs/DEPLOY.md`). It is NOT part of this
      task.
- [x] `npm run typecheck` clean (both tsconfigs; the generated file is under `src/`).
- [x] Commit: the tool files and the generated file. The `.webp` is NOT committed —
      `/public/data/` is gitignored (`.gitignore:109`), like every other texture the build
      emits; it is produced by `npm run build-textures` in the main worktree and synced to R2.

### 3.3: `setPlaceholderMap` on `texturedBodyRenderer` (the crop)

**Files:** `src/@types/rendering/TexturedBodyRenderer.d.ts` (modify),
`src/services/gpu/renderers/bodies/texturedBodyRenderer.ts` (modify)

> ⚠️ **Needs the user's eyes.** The crop cannot be verified headlessly. A wrong `origin`/`flipY`
> assumption yields a vertically mirrored planet sampled from the WRONG TILE ROW, and every
> mock-device test still passes because the mock never rasterises anything.

**Contract:**

```ts
// src/@types/rendering/TexturedBodyRenderer.d.ts
/** Seed a body's per-(body, kind) fallback from an atlas tile. Shadowed by setMap. */
setPlaceholderMap(
  bodyId: BodyTextureId,
  kind: TextureKind,
  atlas: ImageBitmap,
  rect: AtlasTileRect,
): void;
```

Writes into the per-body PLACEHOLDER layer P4a created, never `res.maps`. Implementation mirrors
`setMap` (`:342-369`): create a texture at `rect.w` x `rect.h` in the kind's `KIND_CFG` format
with a full mip chain and `RENDER_ATTACHMENT` usage, copy, `generateMipChain`, store into the
body's placeholder map, rebuild the bind group. Destroy any prior override for that (body, kind)
first.

**The crop, and the trap.** `copyExternalImageToTexture` takes a source `origin`:

```ts
device.queue.copyExternalImageToTexture(
  { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
  { texture },
  [rect.w, rect.h, 1],
);
```

`setMap` uploads with `flipY: true` so texture v=0 is the image's bottom (south) row, matching
the mesh's south-first v. `origin` and `flipY` INTERACT: `origin` selects the region in
UNFLIPPED source coordinates, and the flip is then applied to that region (the bottom row of
the selected region becomes the first row of the destination). The tile must therefore keep the
same orientation a standalone per-body upload would have.

- [x] Implement with `origin` in unflipped source coordinates, as above.
- [x] Add a didactic comment at the copy naming the interaction explicitly, so the next reader
      does not have to re-derive it.
- [ ] **Ask the USER to look**, before moving on: from a cold load, is each planet upright (not
      vertically mirrored) and showing ITS OWN surface (not a neighbouring tile's)? Mars is the
      easiest tell for mirroring (polar caps), Jupiter for tile-row error (banding is
      unmistakable, and its neighbours in registry order are Mars and Saturn).
- [ ] **Escape hatch if the interaction proves awkward:** drop `origin` and crop at the bitmap
      layer with `createImageBitmap(atlas, rect.x, rect.y, rect.w, rect.h)` per tile, then
      upload each sub-bitmap exactly as `setMap` does. Cost is 13 short-lived bitmaps. Do NOT
      spend more than one debugging round on `origin` before taking this.
- [x] `npm test -- texturedBodyRenderer` green (16 passed). No new test: the standing refusal
      covers this task — the crop's correctness is pixels, and the mock device rasterises
      nothing.
- [x] Commit: the two files above.

### 3.4: `setPlaceholderMap` on `earthRenderer`

**Files:** `src/@types/rendering/EarthRenderer.d.ts` (modify),
`src/services/gpu/renderers/bodies/earthRenderer.ts` (modify)

> ⚠️ **Needs the user's eyes** (same reason as 3.3).

**Contract:**

```ts
// src/@types/rendering/EarthRenderer.d.ts
/** Seed a kind's fallback from an atlas tile. Shadowed by setMap. */
setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void;
```

Same crop as 3.3, writing into the placeholder map P4b created (never `committed`). Earth has
no `clearMap`, so this site buys only the out-of-order-arrival protection: a tile arriving
after the hi-res Blue Marble must not replace it, which the two-layer split guarantees by
construction with no ordering check.

Format comes from `isLinearTextureKind(kind)` exactly as `setMap` does (`:494`), so the
placeholder can never disagree with the map that later shadows it. In practice the atlas only
ever passes `'surface'`.

- [x] Implement.
- [ ] **Ask the USER to look:** from a cold load at the Earth home view, does Earth show a
      recognisable low-res Blue Marble (right way up, continents in the right hemisphere)
      before the hi-res map lands, and does it sharpen rather than flicker or revert when the
      hi-res map arrives?
- [x] `npm test -- earthRenderer` green (5 passed). No new test: the standing refusal covers
      this task — the crop's correctness is pixels, and the mock device rasterises nothing.
- [x] Commit: the two files above.

### 3.5: the `'bodyTextureAtlas'` asset (key, slot, fetcher, wiring row, commit fan-out)

**Files:** `src/@types/loading/AssetKey.d.ts` (modify, `:71-81` union + docblock),
`src/@types/engine/state/EngineAssetSlots.d.ts` (modify),
`src/services/loading/fetchers/bodyAtlasFetcher.ts` (new),
`src/services/loading/slots/bodyTextureAtlasSlot.ts` (new),
`src/services/engine/wiring/assetWiring.ts` (modify)

> ⚠️ **Needs the user's eyes** for the end-to-end result; the plumbing itself typechecks.

**Contracts:**

```ts
// src/@types/loading/AssetKey.d.ts — one more union member
| 'bodyTextureAtlas'

// src/@types/engine/state/EngineAssetSlots.d.ts — one more named field
bodyTextureAtlas: AssetSlot<ImageBitmap, void> | null;

// src/services/loading/fetchers/bodyAtlasFetcher.ts
export const bodyAtlasFetcher: Fetcher<ImageBitmap, void>;

// src/services/loading/slots/bodyTextureAtlasSlot.ts
export const createBodyTextureAtlasSlot: SlotFactory<ImageBitmap, void>;

// src/services/engine/wiring/assetWiring.ts — one more row
{
  key: 'bodyTextureAtlas',
  priority: 0,
  factory: (deps) => createBodyTextureAtlasSlot(deps.state, deps.cb),
  req: () => undefined,
  demand: () => true,
}
```

**Fetcher:** mirrors `bodyTextureFetcher`'s shape. `dataUrl('images/textures/body-atlas.webp')`,
`res.ok` guard, `res.blob()`, `createImageBitmap(blob)` with the DEFAULT managed decode (the
atlas is sRGB colour, not linear-packed data, so no `colorSpaceConversion: 'none'`).

**Row placement:** put it FIRST in the `ASSET_WIRING` array, above the point sources. Array
order no longer decides fetch order (the integers do), but it decides tie-breaks, and reading
the table top-down in rank order is worth the zero-cost move. NOT `built: 'external'`: the slot
has no renderer to be co-minted beside, and `installSlots` already routes string keys to their
named field. `demand: () => true` means it loads at boot, unconditionally, which is the point.

**Commit fan-out.** The commit takes the ONE decoded bitmap and seeds every body's placeholder,
reusing the same Earth-vs-other-bodies routing `commitBodyTexture`
(`bodyTextureSlotRegistry.ts:88-116`) already performs:

- for each `[bodyId, index]` in `BODY_ATLAS_LAYOUT`, `rect = atlasTileRect(index,
BODY_ATLAS_GRID.columns, { w: BODY_ATLAS_GRID.tileW, h: BODY_ATLAS_GRID.tileH })`,
- `'earth'` goes to `state.gpu.earthRenderer?.setPlaceholderMap('surface', atlas, rect)`,
- the twelve others go to
  `state.gpu.texturedBodyRenderer?.setPlaceholderMap(bodyId, 'surface', atlas, rect)`.

Null-guard both handles, matching the destroy-race posture every other commit uses (a handle
can be null mid-bootstrap or after teardown; a null handle drops the upload silently and the
slot still transitions to `ready`).

**Do NOT peek at slot state in the commit path.** Routing into the placeholder layer is what
makes out-of-order arrival harmless; a "has the hi-res landed?" check here would re-braid the
loading fact into the rendering path P3 un-braided.

**Error posture:** silent-optional-asset, like `bodyTextureFetcher`. A 404 or decode failure
flows to the slot's `error` state and every renderer keeps its 1x1 placeholder, exactly as
before this feature existed. Subscribe a `console.warn` on `error` the way
`constellationsSlot.ts:54-58` does.

Update the `AssetKey` docblock with a `'bodyTextureAtlas'` bullet alongside `'famousGalaxiesMeta'` /
`'constellations'` / `'flow'`: a singleton sidecar with a named `EngineAssetSlots` field, whose
one bitmap fans out to 13 placeholder seeds rather than committing to a single consumer.

- [x] No test. The wiring is compile-checked end to end (`installLoadProgress.ts:70-74` fails to
      compile on a key with no matching field), and the observable result is pixels. The one test
      edit is a repair: `assetWiring.test.ts`'s membership pin gains the new key.
- [x] Write the fetcher, the slot factory, the type edits, and the wiring row.
- [x] `npm run typecheck` clean; `npm test` full pass (866 files, 5022 tests).
- [ ] **Ask the USER to look:** cold load with DevTools "Disable cache" checked; every visible
      body is textured from the first frame it is drawable, never a flat albedo sphere.
- [x] Commit: the five files above, plus `engine.ts` (the named field must be seeded null in the
      `assetSlots` literal) and the membership-pin repair.

---

## Closing tasks

### 4.1: entanglement-radar over the finished diff

**Files:** none (review only; any fix it prompts is its own commit).

House convention (`CLAUDE.md`, `docs/superpowers/conventions/simplicity.md`): bake the
simplicity review into the plan rather than leaving it to chance.

- [x] Run the `entanglement-radar` skill over the FULL branch diff (part 1 + part 2), not one
      module. It is a diff-scoped review.
- [x] Pay particular attention to the four places this feature deliberately kept two things
      apart, and confirm none of them re-braided during implementation: - the negation lives at the enqueue site, not inside `PriorityQueue` (which still serves
      thumbnails where larger-is-first is the natural reading), - the drop edge is its own edge, not a variant of the evict edge, - residency is a rendering fact read off the renderer, with no second `atlasReady ||
  slotReady` branch anywhere, - the placeholder chain is two-term (`committed ?? placeholder`), with no slot-state peek
      in any commit path.
      **All four verified intact.**
- [x] Report the verdicts. Apply only fixes that are in scope for this feature; anything broader
      (for example the deferred project-wide body-texture store consolidation,
      `docs/backlog/2026-07-24-body-texture-store-consolidation.md`) stays on the backlog.
      Fixed in scope: the atlas filename authored twice, the row-major tile-rect formula
      authored twice, and a residency docblock left stale by P3. Backlogged: direct
      `slot.load()` sites bypassing the queue, the companion relation's three homes, and the
      `bodyId === 'earth'` commit-side routing (appended to the body-texture store
      consolidation item).

### 4.2: verification

**Files:** none (measurement + user visual pass only).

> ⚠️ **Needs the user's eyes.** Nothing in this task can be settled headlessly.

**`npm run perf` will show approximately nothing here, and that null result must NOT be read as
"no regression".** It is a GPU-timing harness: it measures frame cost, not network scheduling.
The entire feature is invisible to it. Run it for exactly ONE question and read it for nothing
else.

- [ ] **The one perf question.** With every registry body texture-resident from boot, resolved
      bodies draw through `texturedBodiesLayer`'s per-body path rather than `planetsLayer`'s
      single instanced batch. Only bodies past `BODY_GLINT_MAX_PX` are affected, so this should
      be a handful of extra draw calls. Read the `perf` skill first
      (`.claude/skills/perf/SKILL.md`); in a worktree pass `--url http://localhost:<port>` from
      YOUR dev server's `Local:` line or you silently measure another branch's server. Quote
      MERGED totals only. Measure before and after on a solar-system-scale scenario. Report the
      delta; do not present it as evidence about anything else.
- [ ] **Cold-cache discipline is the whole measurement.** A warm CDN or disk cache makes any
      run look good regardless of the change, so this matters more than the instrument. Chrome
      DevTools, Network tab, "Disable cache" CHECKED, hard reload, throttled to Fast 3G, plus
      one unthrottled sanity pass. Same branch pair, same throttle profile, same viewport for
      before and after.
- [ ] **What to watch in the waterfall:** - at most 2 concurrent data requests at any moment, - `body-atlas.webp` completes early, - every visible body is textured, never a flat albedo sphere, - `stars-medium.bin` completes BEFORE `glade-medium.bin` starts, - the star field appears materially sooner than on the base branch.
- [ ] **Also check `#focus=body-saturn` from a cold load:** Saturn arrives textured from the
      atlas and upgrades to hi-res on approach. Its RING has no atlas tile by design, so it
      stays untextured for the few seconds before its own 8,832-byte strip lands. That is
      expected, not a bug.
- [ ] Report both the perf delta and the waterfall observations to the user.

---

## Follow-ups (not this work)

- **Instrumenting the structured `[loading] <name> …` events** already emitted by
  `consoleAdapter` (`consoleAdapter.ts:38-53`) plus `installLoadProgress`, to capture commit
  timestamps and diff two runs. It measures exactly the quantity of interest and is cheap. A
  Playwright plus CDP harness was resisted as speculative infrastructure: the scale-gating
  backlog item wants the same harness, so it is better built once when there are two consumers.
- The full out-of-scope list lives in part 1 and in the spec.
