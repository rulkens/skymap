# Galaxy impostor LOD — baked rgba16float textures from the generated galaxy renderer

**Status:** design sketch v3, 2026-07-08 — perf + memory implications
grounded in measured catalog data (band populations, fly-in churn, per-tier
memory baseline, Hubble-type coverage). Ready to promote into a spec.
**Idea (from Alexander):** galaxies below a pixel threshold render from a
texture baked out of the new GPU galaxy generator; galaxies above it render
the full generated 3D point cloud. The baked texture becomes the next step up
from the point renderer and **replaces `proceduralDiskRenderer`**; the
auto-fetched photo-thumbnail band (24–40 px SDSS/DSS atlas quads) **retires**.
Textures are **rgba16float** so they carry linear HDR emission straight
through the existing HDR → tone-map chain.

## Verified current state

The pieces this composes already exist on `main`:

- **Generator**: `src/services/engine/galaxyGenerator/{shared,v1}/` — two compute pipelines
  (`createGenerationPipelines.ts`, workgroup 256) write stars + dust as
  32-byte records (`genRecordBytes.ts`); budgets from `splitStarBudget.ts`
  (min 20 000 stars; MW preset 150 000 at medium tier).
- **Cloud draw**: `milkyWayCloudRenderer.ts` — additive star pass +
  multiplicative dust pass, no depth, into the shared HDR target, with the
  flux-conserving vertex-stage star cull (#412) as the overdraw lever.
- **HDR chain**: `passes/postProcess.ts` — one `rgba16float` offscreen,
  tone-mapped once. rgba16float is renderable + sampleable + blendable in
  base WebGPU.
- **LOD ladder** (`src/data/galaxyLodBands.ts`): point < 8 px → procedural
  disk 8–14 px fade-in → textured photo thumbnail 24–40 px → hi-res famous
  120–160 px. The procedural disk is an analytic bulge+disk profile
  (`shaders/proceduralDisks/fragment.wesl`) — no arms, no bar, no dust.
- **Impostor plumbing**: `instancedQuadRenderer.ts` (shared 64-byte stride),
  axisRatio-squash + PA-rotate billboard math, planner in
  `proceduralDiskSubsystem.ts`, and — load-bearing for this design — the
  **`procFadeOut` crossfade** that already fades the procedural disk out when
  a texture becomes available (today: famous WebPs). "Procedural until the
  bake lands, then crossfade" is existing machinery, not new design.
- **Prior art for the cache shapes**: `resources/textureAtlas.ts` (256 × 128²
  slots, LRU-by-frame), `resources/hiResFamousTexture.ts` (few-layer
  texture_2d_array, LRU-by-recent-px), `galaxyImageQueue.ts` (priority queue,
  concurrency 4, idempotent enqueue).

## The data: how many galaxies are ever in the impostor band?

Measured from the real R2-hosted v6 bins (2026-07-08:
`2mrs.bin` 39 514 rows, `famous.bin` 80, `sdss-{medium,large}.bin`
157 640 / 498 268, `glade-{medium,large}.bin` 410 593 / 1 995 215), using the
runtime's own gate math: `px = diameterKpc/1000/camDist · pxPerRad`,
`pxPerRad = 1080 / (2·tan 30°) ≈ 935` (60° fov, 1080-tall viewport).
Counts are **spherical-shell** counts — what the planner walks and emits
(`proceduralDiskSubsystem.ts` does not frustum-cull); on-screen is ~10% of
shell for the 60°×~95° frustum. Method: standalone Node script decoding the
bins and sweeping camera positions/paths; re-derivable from the formula above.

**Key structural fact:** every SDSS row carries `diameterKpc = 30.0` (the
build-time fallback — SDSS contributes no size measurements), and 99% of SDSS
sits ≥ ~60–100 Mpc out where 30 kpc ≈ 0.1 px — but the tiers' local
flux-limit supplement pulls a small nearby SDSS population in (min distance
4.3 Mpc; 463 rows < 30 Mpc on medium, 2 423 on large), and those _do_ enter
the band (at Virgo core, large tier, the ≥8 px split is: SDSS 123, GLADE 36,
2MRS 24, famous 12). GLADE's p50 diameter is also the 30-kpc fallback (p10
17.7, p90 45.4, large tier). The band is _small_ everywhere because a
20–45 kpc galaxy needs the camera within ~2–5 Mpc to reach 8 px.

Shell counts by apparent-size band (large tier, 2.53 M rows total):

| view                       | 4–8 px | 8–14 | 14–24 | 24–40 | 40–64 | 64–96 | 96–128 | ≥128 | **≥8 total** |
| -------------------------- | ------ | ---- | ----- | ----- | ----- | ----- | ------ | ---- | ------------ |
| home 0.14 Mpc              | 107    | 8    | 7     | 1     | 3     | 0     | 0      | 0    | **19**       |
| Local Volume 5 Mpc         | 310    | 33   | 4     | 5     | 4     | 1     | 0      | 2    | **49**       |
| Virgo approach 17 Mpc      | 400    | 113  | 47    | 19    | 2     | 2     | 1      | 0    | **184**      |
| Virgo core +0.5 Mpc        | 400    | 120  | 53    | 13    | 6     | 2     | 1      | 0    | **195**      |
| 60 Mpc out                 | 38     | 7    | 2     | 0     | 0     | 0     | 0      | 0    | **9**        |
| densest far cell (127 Mpc) | 334    | 35   | 19    | 3     | 0     | 2     | 0      | 0    | **59**       |
| deep field 300 Mpc         | 11     | 0    | 0     | 0     | 0     | 0     | 0      | 0    | **0**        |

Medium tier is ~½ of these (Virgo core ≥8 px: 86). A 4K-tall viewport
doubles `pxPerRad`, which shifts everything one band left — bound ≈ the
4-px column, so worst case roughly **triples** (~600 shell, ~60 on-screen).

Fly-in churn (camera 500 → 0.05 Mpc into Virgo core, 300 log-spaced samples,
large tier) — `unique` = total distinct galaxies ever above the threshold
(= bake count for per-galaxy-unique impostors over an entire dive);
`influx` = worst new entries in one sample (~2.5 samples per frame of a 2 s
tween):

| threshold | max simultaneous | unique over dive | worst influx/step |
| --------- | ---------------- | ---------------- | ----------------- |
| ≥8 px     | 203              | 534              | 12                |
| ≥14 px    | 79               | 277              | 8                 |
| ≥24 px    | 27               | 155              | 6                 |
| ≥48 px    | 9                | 75               | 5                 |
| ≥96 px    | 5                | 31               | 3                 |
| ≥128 px   | 2                | 15               | 2                 |

Orbiting at fixed distance adds **zero** churn — band membership is
spherical, only radial motion crosses thresholds.

## Conclusion the data forces: per-galaxy unique bakes are affordable

The v1 sketch assumed "hundreds to thousands" in-band and recommended a
precomputed archetype library. The measurement kills that assumption: the
whole impostor regime is **≤ ~200 live galaxies and ≤ ~550 bakes for the
longest possible dive** (large tier, 1080p). That is squarely inside what the
thumbnail pipeline already does today (256-slot atlas, 4 concurrent fetches) —
except a bake is ~0.3–1 ms of local GPU instead of a 1–3 s network fetch.

So: **every galaxy can be unique.** Seed the generator from a hash of the
row's _position_ — NOT `objID`: the GLADE and 2MRS parsers emit `objID = 0n`
(no SDSS anchor), so objID is only populated for SDSS rows. A position hash
is stable across sessions _and_ rebuilds (positions only change when the
distance pipeline changes), needs no format bump, and is already the idiom
`galaxyCacheKey(ra, dec)` uses for the thumbnail atlas. Derive
`GalaxyParams` from what the row knows: a real morphological type where one
exists (see the coverage section below), else colourIndex → category mix
(red → elliptical/lenticular-leaning, blue → spiral/irregular), absMag →
size/brightness class; inclination is _not_ baked (see framing below). The
archetype library survives only as a possible **prebaked warm set** (e.g. 32
generic layers shown while a galaxy's own bake is queued) — and even that is
optional given the procedural-disk placeholder band.

## Morphology coverage: how many galaxies have real Hubble types?

What could feed the per-galaxy `GalaxyParams` beyond the colour proxy
(counted 2026-07-08 from the upstream tables + committed seeds):

| source    | typed today                                                                    | notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| famous    | **80 / 80 (100%)**                                                             | `data/seeds/famous_galaxies.seed.json` carries a real type string per galaxy (`"Sbc"`, `"SABc"`, `"E1"`, …) — `classifyHubbleType` maps them already.                                                                                                                                                                                                                                                                                                                                                                                        |
| 2MRS      | **~25.3k / 43.5k rows (58%) overall — but 93–96% inside the impostor's range** | The raw table (VizieR J/ApJS/199/26, bytes 165–169) carries ZCAT morphology for every row; "usable" excludes T=98 never-examined / 19 untyped / 15 peculiar / −9 QSO. Usable fraction by distance: 96.5% < 14 Mpc, 92.9% 14–29 Mpc, 90.1% 29–43 Mpc, 82.8% 43–71 Mpc — the unexamined tail is the distant faint rows that never reach 8 px. Bonus: the ZCAT bar letter (A/X/B) maps directly onto the spiral↔barred split, and the T-type digit onto E/S0/Sa–Sm/Irr. The parser (`tools/parsers/twoMrs.ts`) currently _ignores_ these bytes. |
| GLADE     | **0 in-pipeline; typeable via PGC → HyperLEDA**                                | GLADE has no morphology columns, but raw col 1–7 is the PGC key and `fetchHyperLeda.ts` already queries HyperLEDA `meandata` per PGC (for pa/logr25/mod0) — adding `type` to the fetched column list is a one-line change + cache refresh. Local-volume GLADE rows: 2 697 < 30 Mpc (medium), 7 362 (large). HyperLEDA's cache is intentionally partial (52k PGCs), sized to the local volume — which is exactly the impostor population.                                                                                                     |
| SDSS      | **none**                                                                       | The SkyServer CSV has no morphology; the local supplement rows (463 medium / 2 423 large < 30 Mpc) fall back to the colour proxy. (Galaxy Zoo would be a new data source — out of scope.)                                                                                                                                                                                                                                                                                                                                                    |
| Milliquas | n/a                                                                            | AGN/quasar points; never in a disk band.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Delivery path without a .bin format bump: `classByte` is _defined_ as
source-interpreted ("future per-galaxy-catalog class signals (e.g. GLADE
morphology) add a new branch here without touching the .bin format" —
`sourceClass.ts`), so a packed category+bar+T byte per source slots straight
in; 6 spare padding bytes remain if more is wanted.

Bottom line: the galaxies big enough to _deserve_ a real type mostly have
one — nearly all 2MRS + famous band members (the largest/nearest), GLADE
one fetcher-edit away, and only the SDSS supplement rides the colour proxy.

## The sliders (what you can tune, and what each costs)

1. **Impostor entry threshold `N` px** — the procedural disk stays as the
   8 → `N` band (Alexander's suggestion), impostors take `N` → full-geometry.
   The table above _is_ this slider: `N`=8 → ≤203 live/≤534 bakes;
   `N`=14 → ≤79/≤277; `N`=24 → ≤27/≤155. Because the procedural disk is also
   the bake-latency placeholder (crossfade via the existing `procFadeOut`
   path), `N` is a _quality_ dial, not a correctness one — safe to ship at
   `N`=14 and lower it toward 8 after profiling.
2. **Bake budget per frame** — 1–4 bakes/frame through a
   `galaxyImageQueue`-shaped priority queue (largest-px-first, idempotent
   enqueue). Worst measured burst ≈ 12–30 new entries in a fast tween frame;
   at 4/frame the queue drains in well under 200 ms while the procedural band
   covers. A bake ≈ one 20k-star generation dispatch + a star/dust render
   into a tiny target + ~7 mip blits ≈ 0.3–1 ms GPU: comfortably hideable,
   also skippable entirely on frames with tween motion if profiling says so.
3. **Bake star budget** — stars per baked galaxy (20k floor from
   `splitStarBudget` is plenty for ≤256² texels; 50k for hero quality).
   Linear in bake time, zero resident memory (generation buffers are
   transient scratch, ~1 MiB reused serially).
4. **Texture resolution × framing** — the subtle one. The gate px measures
   the _physical_ diameter, but the drawn quad is **4× padded**
   (`paddedRadiusMpc.ts`). If the bake frames the padded footprint, a 128²
   texture holds only ~32 texels across the galaxy — blurry past gate-32 px.
   Frame the bake at ~2× the galaxy diameter (the generator's halo/globulars
   reach ~1.5–2×, `outerRadiusOf`) and shrink the impostor quad to match:
   then texels-across-galaxy = side/2, i.e. **128² is sharp to gate-64 px,
   256² to gate-128 px**. Per-layer cost with mips: 128² = 171 KiB,
   256² = 683 KiB.
5. **Cache depth (array layers, LRU-by-recent-px)** — sized by max
   simultaneous, not by catalog size: 256 layers ≥ the 203 worst case with
   headroom; 384 covers the 4K case. Because it's an LRU over a
   camera-continuous quantity, misses only happen on threshold _entry_,
   which the queue + placeholder already handle.
6. **Two-tier resolution split (optional)** — the population is so skewed
   (≥24 px ≤ 27 simultaneous; 8–24 px carries the bulk) that a hybrid wins if
   sharpness above gate-64 matters: 256 × 128² for the 8→24 swarm
   (43 MiB) + 48 × 256² for ≥24 px (32 MiB) ≈ **75 MiB**, re-baking a galaxy
   into the hi-res array when it crosses 24 px (a re-bake is just another
   queue entry). Single-tier 256 × 128² (43 MiB) is the simple v1: mild
   magnification softness 64→128 px on a diffuse glow object, far sharper
   than today's procedural profile at every size.
7. **Full-geometry entry threshold + residency cap** — data: ≥128 px is
   **≤2 simultaneous, ≤15 unique per dive**. A cap of 4 resident generated
   clouds (100k–400k stars → 3–13 MiB each, LRU-by-recent-px like
   `hiResFamousTexture`) is generous; churn is trivial. The 120→160 px
   crossfade band hides the one-off generation dispatch (<1 ms).
8. **Uniqueness levers that cost nothing** — per-instance hue from the
   existing colour-index ramp, seeded flip/rotation, brightness scale from
   absMag: all applied in the vertex/fragment on top of whatever texture is
   bound, so even placeholder-archetype frames don't repeat visibly.

## Baseline: total memory per tier today

Measured 2026-07-08 from the R2 artefact sizes + the runtime's buffer
formulas (52 B/point vertex stride, `GalaxyCatalog` decoded arrays ≈ 58 B/row,
SCFD → r16float/rgba16float 3D textures ≈ file size, MW star budgets
75k/150k/300k × 32 B). Row counts per tier: small 367 646, medium 807 827,
large 3 476 538 (2MRS 39 514 + famous 80 are tier-agnostic; SDSS 0/157 640/
498 268; GLADE 268 052/410 593/1 995 215; Milliquas 60 000/200 000/943 461).

**Tier-scaled memory (MB):**

| component                                | small   | medium   | large      |
| ---------------------------------------- | ------- | -------- | ---------- |
| point vertex buffer (GPU, 52 B/row)      | 19      | 42       | 181        |
| decoded catalogs (CPU heap, ~58 B/row)   | 21      | 47       | 202        |
| MCPM volume 3D texture (GPU, if enabled) | 2.4     | 19.4     | 155.5      |
| MW cloud star+dust buffers (GPU)         | 3.4     | 6.1      | 11.2       |
| **tier-scaled subtotal**                 | **~46** | **~115** | **~550**   |
| network transfer, catalog bins (+MCPM)   | 24 (+2) | 52 (+19) | 223 (+156) |

**Tier-independent (add once; MB):**

| component                                         | size     |
| ------------------------------------------------- | -------- |
| filaments (GPU buffers ≈ bin)                     | ~31      |
| flowfield 128³ rgba16f 3D texture (if enabled)    | 16.8     |
| CF-4 density volume (if enabled)                  | 4.2      |
| thumbnail atlas 2048² rgba8                       | 16.8     |
| hi-res famous array (8 × 1024² rgba8, worst case) | 33.6     |
| HDR target rgba16f @1080p                         | 16.6     |
| pick r32uint + depth @1080p                       | ~16.6    |
| volume offscreen (half-res rgba16f) @1080p        | 4.1      |
| **subtotal**                                      | **~140** |

Screen-sized targets scale with device-pixel area: ×4 at dpr 2 (the three
rows above become ~150 MB on a retina laptop). Ballpark totals (everything
enabled, 1080p @dpr 1): **small ~190 MB, medium ~260 MB, large ~690 MB** —
large tier is already dominated by the 181 MB vertex buffer + 155 MB MCPM
cube, which is why it's desktop-only today. The impostor feature's +45–75 MB
(below) is a tier-appropriate increment: its caches can scale with tier
(128 layers on small) exactly like every other budget in this table.

## Impostor memory budget (recommended v1 vs rich config)

| Config                            | Impostor cache | Full-geo cache (cap 4) | Retired photo atlas | Net vs today   |
| --------------------------------- | -------------- | ---------------------- | ------------------- | -------------- |
| v1: 256 × 128², N=14              | 43 MiB         | ~20–50 MiB             | −16 MiB             | **+45–75 MiB** |
| rich: 256 × 128² + 48 × 256², N=8 | 75 MiB         | ~50 MiB                | −16 MiB             | **+110 MiB**   |

(The 24–40 px photo band retires: `textureAtlas.ts`'s 16 MiB rgba8 atlas, the
fetch queue's network traffic, and the `2026-06-29-thumbnail-quality-sdss-dss`
backlog item's in-scene half all go with it. Famous curated WebP + hi-res
presumably stay — a generated cloud is _a_ galaxy, not M31 — confirm at spec
time.)

## Per-frame performance

- **Impostor band**: ≤ ~200 instanced quads (≤ ~600 at 4K) sampling one
  mipmapped array texture — strictly cheaper than today's procedural
  fragment at the same instance counts. CPU planner walk unchanged; the
  dominant cost in this regime remains the two-planner catalog walk
  (`backlog/2026-06-30-unify-disk-planner-walks.md`, ~4.2 ms of a 5.1 ms
  frame) — do that unification first rather than adding a third walk.
- **Full-geometry tier**: ≤2 simultaneous measured (cap 4) × the Milky Way
  draw cost, with the same flux-conserving star cull. Additive fill when one
  galaxy spans ~1000 px is the dominant GPU cost — same as the MW today.
- **Bakes**: 0.3–1 ms each, ≤4/frame, only during radial motion near
  galaxies; zero when orbiting or in deep field.
- **Pick**: impostor quads reuse the procedural pick pipeline verbatim;
  full-geometry galaxies get a pick billboard (`milkyWayPickRenderer.ts`
  pattern).

## Why rgba16float is the right call (and its one subtlety)

Baking **linear pre-tonemap emission** with the same star/dust shaders + the
same exposure constant means the impostor sample and the live cloud are the
same signal — the crossfade to full geometry cannot shift brightness, and
nothing is tone-mapped twice. fp16 range/precision comfortably cover the
documented accumulation peaks. Live dust multiplies the framebuffer, but a
baked impostor folds extinction into its own RGB and composites purely
additively — identical to the procedural disk's blend today, so no
blend-model change.

The subtlety is **flux calibration at the bottom of the band**: point-sprite
brightness derives from catalog magnitude; a baked galaxy's total light from
the generator + exposure. The impostor instance needs an absMag-derived
brightness scale (already baked into the point vertex record since #411)
multiplying the sampled texel, and the mip chain must be a plain
flux-preserving box filter, so total light is conserved across the
point↔procedural↔impostor crossfades and down the mip levels. WebGPU has no
auto-mipgen — the bake ends with a short downsample chain (render into each
array layer's mip views; a layer view is a valid color attachment, no copy).

## Interaction with renderer unification

The compositor spec (`specs/2026-06-29-renderer-unification-design.md`,
plans 01–04 in flight) makes "additive layer into `hdr`" a registry entry and
already owns the offscreen-pass pattern. The impostor pass should land as a
registry layer and the bake as an offscreen pass — sequence after plan 02
(registry + program) to avoid hand-wiring a fifth bespoke `encode*`.

## Open questions

1. **`N` (impostor entry)**: ship at 14 and tune down, or straight to 8?
   (Data says either is affordable; 14 halves the bake churn.)
2. **Resolution config**: v1 single 128² array vs the two-tier split —
   decide after the visual gate shows how objectionable gate-64→128 px
   magnification softness is on diffuse emission.
3. **Param derivation**: how much of the morphology-coverage table to wire
   up for v1 — famous types are free, 2MRS ZCAT is a parser-column addition
   (+ a `classByte` branch), GLADE-via-HyperLEDA is a fetcher edit + cache
   refresh; the colour proxy (2MRS J−K vs SDSS g−r meaning differs —
   `pickColourIndex` normalizes) covers the rest.
4. **Famous galaxies**: keep curated WebP/hi-res photo path (likely yes), and
   does the generated impostor serve as _their_ placeholder too?
5. **GLADE fallback diameters**: p50 is the 30-kpc fallback — fine for
   gating, but should the _bake's_ size class trust `diameterKpc` or absMag
   when the two disagree?
6. **Tier/viewport scaling**: 4K roughly triples band counts — scale `N`, the
   cache depth, or neither (43 MiB → 64 MiB is still cheap)?
