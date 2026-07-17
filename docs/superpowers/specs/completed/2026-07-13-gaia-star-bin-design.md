# Gaia Star Bin — Design

**Status:** Draft (2026-07-13)

**Goal:** Ingest ESA Gaia DR3 photometry + Bailer-Jones distances into a tiered,
cell-quantized stellar `.bin` (`stars-{small,medium,large}.bin`), ship it through
the existing tier/R2 pipeline, and render it with a dedicated vertex-pulling
renderer as the real-data middle of skymap's continuous Earth→cosmos zoom.

Full decision ledger (every choice below is fixed there, not re-litigated here):
[`docs/grill-sessions/gaia-star-bin-2026-07-13.md`](../../grill-sessions/gaia-star-bin-2026-07-13.md).

---

## Verified external facts (ESA Gaia TAP, confirmed live 2026-07-13)

Confirmed against the live TAP sync endpoint per the verify-before-specing rule.
These are the load-bearing numbers the format/tier/selection sections assume.

- **TAP sync endpoint:** `https://gea.esac.esa.int/tap-server/tap/sync`
- **Source table:** `gaiadr3.gaia_source_lite` — carries every column the build
  needs: `source_id`, `ra`, `dec`, `parallax`, `parallax_error`,
  `parallax_over_error`, `ruwe`, `phot_g_mean_mag`, `bp_rp`, `random_index`
  (pagination key), `l`, `b`, `teff_gspphot`.
- **Bailer-Jones distances:** `external.gaiaedr3_distance` — `source_id`,
  `r_med_geo`, `r_lo_geo`, `r_hi_geo`, `r_med_photogeo`, `r_lo_photogeo`,
  `r_hi_photogeo`, `flag`. EDR3-named but `source_id`s are shared with DR3;
  joining against `gaiadr3.*` is the standard pattern.
- **GCNS:** `external.gaiaedr3_gcns_main_1`, exactly **331,312** rows (the
  rejected-companion table `external.gaiaedr3_gcns_rejected_1` is not used).
- **Source counts by G limit:**

  | `phot_g_mean_mag <` | rows |
  |---|---|
  | 12.0 | 3,087,821 |
  | 13.0 | 7,369,627 |
  | 13.5 | 11,193,267 |
  | 14.0 | 16,844,156 |
  | 14.5 | 25,067,889 |

- **BJ coverage at G<14:** 16,716,140 / 16,844,156 (**99.24 %**) join to
  `external.gaiaedr3_distance`; 16,666,056 of those (**99.7 %**) have
  `r_med_photogeo`. The ~128 k unjoined rows (0.76 %) are a **counted, logged
  drop** (§4), never silent.
- **Bright end:** only **150** sources at G<3 exist in all of DR3 (vs ~190 real
  stars that bright) — the empirical basis for the Hipparcos patch (§2).

### Open verification items (resolve at plan time — do not assume here)

- The exact G threshold where DR3 astrometry degrades at the bright end
  (working assumption ~G<3; confirm against the Hipparcos cross-match literature).
- Real zstd compression ratios on Morton-sorted quantized data (**measure in
  the pipeline** — do not bake the 25–35 % grill estimate into any constant).
- Hipparcos-2 raw-file source URL + byte layout (needed to write the parser +
  register the raw file).

---

## 1. Goal & role

The bin is regime **(c)** of the continuous zoom — the real-data crossfade
middle. Flying out from Earth, the descent passes through:

```
Earth ──▶ near-field bodies ──▶ [a+b neighborhood bin, future] ──▶
   Gaia bubble (THIS bin) ──▶ crossfade ──▶ procedural Milky-Way cloud
```

A magnitude-limited Gaia sample is a **lopsided ~3 kpc bubble** (Local Bubble,
Orion-arm tendrils, nearby clusters), not the galaxy seen from outside: dust
extinction hides the disk past ~3–4 kpc and parallax smears past ~2 kpc. The bin
is data-honest at every scale — density genuinely thins outward, which is exactly
the shape the crossfade wants — and hands off to the procedural cloud where real
data runs out (grill Q1a/Q2).

**Non-goals:**

- **NOT the galaxy-from-outside.** That stays the procedural MW cloud's job; the
  Gaia data physically cannot show it.
- **NOT the a+b solar-neighborhood bin.** A separate future project (a denser,
  near-field-parallax experience). Its volume overlaps this bin's GCNS supplement
  (§2) — dedup/handoff is that project's problem, flagged in §7.
- **NOT galaxy-catalog v7.** The cell-quantized format here is designed to be
  portable to the galaxy bins later (grill Q1b), but that port is its own future
  project. This spec proves the format on the greenfield star bin only.

---

## 2. Selection function

One rule, unioned with one supplement (grill Q3, Q6):

```
keep  ⟺  (phot_g_mean_mag < G_tier)  ∪  (GCNS membership)
```

**Magnitude cut (the body of the bin).** Sort DR3 by `phot_g_mean_mag`, truncate
at the record count that hits each tier's byte budget — the exact G limit is a
consequence of the budget, not a round number (same philosophy as
`subsampleByAbsMag`). Density falls off with distance naturally, and the cut
automatically contains every naked-eye star, so the bin doubles as the from-Earth
night sky. Accepted artifact: radial "fingers" toward the Sun from parallax
smearing past ~2–3 kpc — treatable later, does not drive selection.

**GCNS supplement (all tiers).** `external.gaiaedr3_gcns_main_1` — 331,312
curated, vetted DR3 stars within 100 pc, someone else's careful quality cuts for
the hardest regime (faint nearby stars). ~2 MB packed, affordable even in the
small tier, so the solar neighborhood stays interesting at every tier. GCNS rows
keep their own vetted distances.

The union is two populations serving one visual; the galaxy pipeline's
local-volume flux supplement is the exact precedent. Tier nesting is a build
convenience, not a format invariant — each tier is independently encoded, so the
supplement simply participates in all three (§3).

**Position source (grill Q7).** Per row, in priority order:

1. `r_med_photogeo` (Bailer-Jones photogeometric — community default for 3D maps)
2. `r_med_geo` (geometric fallback where photometry is unusable)
3. GCNS rows: the GCNS vetted distance
4. else → **counted, logged drop** (the ~0.76 % at G<14 with no BJ join)

Position is the one field that cannot be patched without a rebuild, so the
distance choice is locked into the encode.

**Bright-end Hipparcos patch (~300 stars, grill Q10).** DR3 holds only 150
sources at G<3 (vs ~190 real), so a pure Gaia build ships a night sky missing
Sirius, Canopus, Vega, Arcturus, α Cen. At build time, merge Hipparcos-2 rows for
everything brighter than the reliability threshold (structurally identical to the
CF-4 distance patch in `buildAllBins`). The exact threshold is an open
verification item (§ above).

**Dedup, stated once as build-time set subtraction.** The Hipparcos patch and the
curated FamousStar overlay (§5) both risk doubling stars Gaia already has. Rather
than a runtime remember-to, the build computes the final star set as:

```
stars = gaiaSelected ∪ (hipparcosBright ∖ gaiaSelected) ∖ famousStarSet
```

The subtraction happens once, in the encoder, keyed on cross-match (Hipparcos↔Gaia
by position/HIP↔source_id; FamousStar↔Gaia by the curated FamousStar identifiers).
Downstream — format, renderer, crossfade — never sees a duplicate, so no path
carries special-case logic for it. Cross-match keys are a plan-time detail (§7).

---

## 3. Binary format

New format, own magic + version, loud failure on mismatch — mirroring
[`src/data/galaxyCatalog/galaxyCatalogFormat.ts`](../../../src/data/galaxyCatalog/galaxyCatalogFormat.ts):
the `magic + version` header is the single source of truth for "do I understand
this file?", and a version bump surfaces as the documented
"regenerate via `npm run build-stars`" error.

The layout is a **Morton-ordered cell grid** with an in-file **octree flux
mipmap**; the whole file is **zstd-compressed** on R2 and inflated in the browser
via native `DecompressionStream` (grill Q1a). Given as a contract of
offsets/widths, not encoder code.

### File header (little-endian)

| Offset | Bytes | Field | Notes |
|---|---|---|---|
| 0 | 4 | `magic` = `"SKST"` | distinct from `"SKMP"` galaxy magic |
| 4 | 4 | `version` (uint32) | bump ⇒ loud regenerate error |
| 8 | 4 | `starCount` (uint32) | leaf star records |
| 12 | 4 | `nodeCount` (uint32) | octree nodes (leaf + aggregate) |
| 16 | 4 | `mortonBitsPerAxis` (uint32) | grid resolution (≈9 → 512³) |
| 20 | 4 | `cellEdgePc` (float32) | leaf-cell edge, parsecs |
| 24 | 8 | `gridOriginX` (float64) | grid corner, parsecs, heliocentric |
| 32 | 8 | `gridOriginY` (float64) | |
| 40 | 8 | `gridOriginZ` (float64) | |
| 48 | 16 | reserved (zeroed) | future header metadata |

Cell origins are **derived**, never stored per cell: a node's world origin =
`gridOrigin + mortonDecode(mortonIndex) · cellEdgePc`. `gridOrigin` is f64 so the
CPU can subtract it from the camera before upload (§6 precision story).

### Octree node table (`nodeCount` entries)

| Offset | Bytes | Field | Notes |
|---|---|---|---|
| 0 | 4 | `mortonIndex` (uint32) | locates + sizes the node's box |
| 4 | 1 | `level` (uint8) | 0 = leaf; >0 = aggregate, box scales ×2^level |
| 5 | 3 | `childMask`/reserved | octree descent bits (leaf: 0) |
| 8 | 4 | `firstRecord` (uint32) | index into the record array |
| 12 | 4 | `recordCount` (uint32) | leaf: stars in cell; aggregate: 1 |

Nodes are stored so a nearest-first cut through the tree is a linear-ish walk
(Morton order already clusters spatially). The renderer refines from the root
until its drawn-point budget is spent (§6).

### Packed record (6 bytes) — leaf star *and* aggregate

Both a real star and a mip aggregate use the identical 6-byte packing, so the
renderer draws either from one code path.

| Bits | Width | Field | Meaning |
|---|---|---|---|
| 0–9 | 10 | `offsetX` | in-cell position, 0..1023 across `cellEdgePc` (~0.08 pc at 512³ over a ~40 kpc box → ~78 pc cells) |
| 10–19 | 10 | `offsetY` | |
| 20–29 | 10 | `offsetZ` | |
| 30–36 | 7 | `absMag` | absolute-magnitude LUT index, 0.19-mag steps |
| 37–42 | 6 | `colorIdx` | BP−RP → color LUT index (§7 open question) |
| 43–47 | 5 | spare | reserved — see allocation table below |

Total 48 bits = 6 bytes = the GPU-resident size (shader-side unpack, §6).

**Spare-bit allocation (design detail — decide at plan time):**

| Candidate use | Bits | Rationale |
|---|---|---|
| variability / spectral-class flag | 1–2 | drive subtle twinkle or class tint |
| aggregate-vs-leaf marker | 1 | avoids a table lookup in the hot path |
| reserved | rest | leave zeroed for a future field |

For an **aggregate** node the record is the flux-merge of its ~8 children:
position = flux-weighted centroid (quantized into the parent cell), `absMag` =
magnitude of the **summed flux**, `colorIdx` = flux-weighted mean color. The mip
is built per tier at encode time (~14 % storage overhead), so distant faint stars
render as flux-preserving, brightness-honest aggregates when they'd be sub-pixel
anyway (grill Q9).

### Compression

The entire file (header + node table + records) is zstd-compressed and stored
`.bin` on R2. The runtime inflates with browser-native `DecompressionStream`
before decode. Morton ordering makes neighboring records near-identical, which is
what makes the ratio pay off — but the real ratio is **measured in the pipeline**,
never assumed (§ verification items).

---

## 4. Acquisition pipeline

Two commands, mirroring the fetch→build→sync shape of every other catalog and the
CLAUDE.md **"Adding a new raw data source"** checklist (per-catalog subdir, every
file in `rawDataRegistry.ts`, provenance README + sha256 sidecars committed).

```
[fetch — npm run fetch-gaia]

  gaiadr3.gaia_source_lite  JOIN  external.gaiaedr3_distance
    │  TAP sync queries, paged by random_index ranges
    │  on-disk resume cache (skip already-fetched pages), à la fetchHyperLeda.ts
    └─▶ data/raw/gaia/gaia_source_page_*.csv        (gitignored)

  external.gaiaedr3_gcns_main_1  (separate fetch)
    └─▶ data/raw/gaia/gcns_main.csv                 (gitignored)

  Hipparcos-2 bright set  (separate fetch; URL+layout = open item)
    └─▶ data/raw/gaia/hipparcos2.dat               (gitignored)

  provenance + integrity (committed):
    data/raw/gaia/README.md            (upstream URLs, columns, fetch date)
    data/raw/gaia/gaia.sha256          (sidecars per the checklist)

[build — npm run build-stars]

  raw csv/dat ──▶ select (§2) ──▶ position source (§2) ──▶ dedup subtraction (§2)
              ──▶ Morton sort ──▶ per-tier truncate ──▶ build octree mip
              ──▶ pack 6B records ──▶ zstd
    └─▶ public/data/stars-{small,medium,large}.bin  (gitignored build artefacts)

[sync — npm run sync-r2-secure]   (extend syncR2.ts ALLOW filter, §5)
```

**Fetch mechanics.** `random_index` is Gaia's built-in uniform-shuffle pagination
key: split its range into contiguous slices, one TAP `sync` request per slice, and
write each slice's rows to its own cache file. Resume = skip any slice whose cache
file already exists (the fetchHyperLeda.ts resume discipline: never leave a
partial file, count + log failures rather than silently dropping a run). GCNS and
Hipparcos are separate, smaller fetches with their own cache files.

**Raw-data registry.** New `gaia.*` keys in
[`tools/utils/io/rawDataRegistry.ts`](../../../tools/utils/io/rawDataRegistry.ts):
`gaia.source-dir` (directory — dynamic page filenames), `gaia.gcns`,
`gaia.hipparcos`, `gaia.readme`, `gaia.sha256`. Consumers call `rawDataPath('gaia.…')`,
never a literal path. `source: 'gitignored'` for fetched data, `'committed'` for
README + sha256 (both covered by the existing `!/data/raw/**/README.md` and
`*.sha256` globs — plain `git add`, no gitignore edit).

**R2.** Extend the `ALLOW` filter in
[`tools/deploy/syncR2.ts`](../../../tools/deploy/syncR2.ts) with
`/^stars-(small|medium|large)\.bin$/`. The `.bin` files are gitignored build
artefacts (the `public/data/*.bin` rationale), shipped only via R2.

---

## 5. Tiers

`stars-{small,medium,large}.bin`, transfer-size budgets (grill Q4):

| Tier | Transfer budget | ≈ stars | ≈ G cut | + GCNS |
|---|---|---|---|---|
| large | ~75 MB | ~17 M | G<14.0 (16.84 M) | +331 k (~2 MB) |
| medium | ~30 MB | ~6 M | ~G<12.8 (between 3.09 M @ G<12 and 7.37 M @ G<13) | +331 k |
| small | ~10 MB | ~2 M | ~G<11.6 | +331 k |

75 MB is the **transfer** size of the large tier (what hurts users); GPU pressure
is managed by the draw-cut budget (§6), not by shipping fewer stars. Exact
stars-per-tier are fixed at build time by record count against the measured
compressed size, not by round G values. The GCNS supplement rides every tier. The
flux mip is rebuilt per tier so each file is self-contained.

Tiering reuses existing muscle for free: `state.sources.tier`, `cloudLoader`, the
`dataUrl()` prefix, and (once §4 lands) the `syncR2.ts` ALLOW set — the same path
the galaxy catalogs and MCPM tiers take.

---

## 6. Registry integration

**New `starCatalog` SourceEntry variant.** A tenth arm on the `SourceEntry`
tagged union in
[`src/@types/data/SourceEntry.d.ts`](../../../src/@types/data/SourceEntry.d.ts),
modeled on the MCPM `VolumeSourceEntry` (singleton, tier-aware asset, look +
crossfade defaults carried in-row):

```ts
// src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts   (one type per file)
export type StarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Filename stem under public/data/; loader appends `-<tier>.bin`. */
  readonly binBaseName: string; // 'stars'
  /** Ships per-tier `.bin` variants (always true for this source). */
  readonly tiered: boolean;
  /** Per-frame drawn-point budget: typical + hard cap (§ renderer). */
  readonly drawBudget: { readonly typical: number; readonly hardCap: number };
  /** Camera-distance crossfade band to the procedural MW cloud, parsecs. */
  readonly crossfadePc: { readonly inner: number; readonly outer: number };
};
```

Tier filenames come from the existing `tierFilenameForSource`-style naming
(`stars-<tier>.bin`); the tier-aware fetcher branch is the plan's to wire (it
currently narrows on `type === 'galaxyCatalog'` /`'volume'`).

**New appended `Source` code.** `Source.StarCatalog = 24` (next after `Earth = 23`)
in [`src/data/source.ts`](../../../src/data/source.ts) — append-only, never
renumber. Not in `GALAXY_CATALOG_SOURCES`, so it never joins the visibility
bitmask (galaxyCatalog-only). Not pickable (no pick-texture code — those are
galaxyCatalog/structure only). Its row lives in `src/data/sources/star-catalog.ts`
and is stitched into `SOURCE_REGISTRY`.

**Companion rename (grill Q8b).** The existing seeded-bodies row
`Source.Star = 21` / `STAR_ENTRY` (`type: 'star'`, the SCENE_STARS anchors)
renames to `Source.FamousStar` / `FAMOUS_STAR_ENTRY`, mirroring the
FamousGalaxy↔survey split — the rename *names* the dedup story (§2): famous stars
are the curated overlay, the Gaia bin is the survey. This is a **key/const/id
rename only**; the numeric value stays 21 (codes are append-only *by value*, and
body codes aren't persisted), and the body renderer/content-layer is untouched.
File `src/data/sources/star.ts` → `star-catalog.ts` is the *new* bin; the renamed
famous-star row moves to `src/data/sources/famous-star.ts`.

**State.** Follows the singleton-overlay convention (project memory
`project_singleton_overlay_layers`): live state in `settings.<layer>`, a
status-only store, no bitmask membership — exactly how filaments / milkyWay / flow
sit in the registry while keeping their state in `settings`.

---

## 7. Renderer

A **dedicated star renderer** — not `pointRenderer` (galaxy billboards), not the
per-body `starPointsLayer` / `starSpheresLayer` (those stay the FamousStar path).

- **Vertex pulling** from a packed storage buffer: the 6-byte records upload
  as-is; the shader manually unpacks the u32 fields, sidestepping vertex-format
  alignment. Reuses the 3-vertex circumscribing-triangle billboard trick from
  #428 (`draw(3)` per star, no per-vertex attributes).
- **Per-cell origin dequantization = the precision story.** Each node's f64 world
  origin (`gridOrigin + mortonDecode(index)·cellEdge`) is subtracted from the
  camera **CPU-side in f64**; only the small camera-relative cell origin (f32) and
  the 10-bit in-cell offsets reach the GPU. No global f32 position ever exists, so
  the cell-local quantization (~78 pc cells) never fights f32 range at kpc distances.
- **Per-frame hierarchical cut.** Walk the octree nearest-first, drawing leaf
  cells near the camera and coarser flux aggregates farther out, refining until
  the **drawn-point budget** is spent. Far views are naturally cheap (a few
  hundred k aggregates); deep in the bubble, distant faint stars draw as
  brightness-honest aggregates.
- **Budget (grill Q9).** Start ~**1 M typical / 2 M hard cap**; the small tier
  carries a lower cap for mobile. The budget **must be live-tunable during
  bring-up** (DebugPanel-slider style), then frozen into named constants once
  tuned by eye.
- **HDR.** Additive accumulation through the existing tone-map path (the same
  path the MW cloud sprite and galaxy points already share).

**Crossfade (grill Q5, option a).** The star bin fades out / the procedural MW
cloud fades in over a **hand-tuned camera-distance band ~2→5 kpc from the Sun** —
the same fade-band mechanism the MW cloud sprite shipped (`e04ec827`). Band
endpoints (`crossfadePc.inner`/`.outer` on the row) are **named constants and
live-tunable during bring-up**, then frozen. V1 accepts a possibly-visible seam;
density calibration of the procedural cloud's inner region against Gaia counts is
explicitly deferred to
[`docs/backlog/2026-07-13-star-bin-crossfade-density-calibration.md`](../../backlog/2026-07-13-star-bin-crossfade-density-calibration.md).

---

## 8. Open questions / plan-time items

- **BP−RP → color LUT.** How the 6-bit `colorIdx` relates to the existing
  `colourIndex` spec / `colorIndex.wesl` ramp (that pipeline maps *galaxy* band
  differences onto a 0..2 ramp; stellar BP−RP is a different physical quantity and
  likely wants its own LUT). Decide the LUT and its ramp at plan time.
- **Slab / pass placement.** Which depth slab/pass the star renderer draws in
  (NEAR0 vs COSMO), given the cell-origin-relative scheme rather than the shared
  `renderOrigin`. Interacts with the zoom-to-earth NEAR0 far-plane work in flight.
- **Sun exclusion.** Gaia has no Sun row; the FamousStar layer owns the Sun. Confirm
  nothing in the selection accidentally injects a zero-distance artefact.
- **a+b bin overlap.** The future a+b neighborhood bin's volume overlaps the GCNS
  100 pc supplement — its dedup/handoff story is deferred to that project (grill
  Q6/§1 non-goals).
- **Galaxy-bin v7 port.** Porting this cell-quantized format to the galaxy bins is
  a separate future project (grill Q1b); the format is designed to be portable but
  the port is out of scope here.
- **Cross-match keys** for the §2 dedup subtraction: Hipparcos↔Gaia and
  FamousStar↔Gaia (position + designation vs `source_id`).
- **The three verified-facts open items** (bright-end G threshold, measured zstd
  ratio, Hipparcos-2 URL + byte layout) — resolve as the plan's first act.

---

## References

- Grill ledger: [`docs/grill-sessions/gaia-star-bin-2026-07-13.md`](../../grill-sessions/gaia-star-bin-2026-07-13.md)
- Closest precedent spec (tiered binary asset + fetch pipeline + singleton renderer):
  [`docs/superpowers/specs/completed/2026-05-11-mcpm-cosmic-web-volume-design.md`](completed/2026-05-11-mcpm-cosmic-web-volume-design.md)
- Binary-format precedent: [`src/data/galaxyCatalog/galaxyCatalogFormat.ts`](../../../src/data/galaxyCatalog/galaxyCatalogFormat.ts)
- Deferred crossfade calibration: [`docs/backlog/2026-07-13-star-bin-crossfade-density-calibration.md`](../../backlog/2026-07-13-star-bin-crossfade-density-calibration.md)
- Gaia DR3: Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1
- Bailer-Jones distances: Bailer-Jones et al. 2021, AJ 161, 147
- GCNS: Gaia Collaboration, Smart et al. 2021, A&A 649, A6
