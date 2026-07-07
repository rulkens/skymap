# DESI Deep Cone — ultra-deep patch source + finger-of-god fly-through clip

**Date:** 2026-07-07
**Status:** spec — awaiting plan
**Seeds:** [`docs/research/2026-06-05-desi-dr1-as-a-data-source.md`](../../research/2026-06-05-desi-dr1-as-a-data-source.md) (verified DR1 facts + integration shape)

## Goal

A permanent new survey source: a narrow ultra-deep cone of DESI DR1 spectroscopy —
"drill core" through the universe — dense enough at low z to show real fingers of
god and deep enough (z ≈ 3.5, ~7,000 Mpc comoving) to fly out 2.4× farther than
anything skymap currently renders. On top of it, a live in-app fly-through clip
authored on the existing clip system.

The original wish was "fly through a finger of god". Investigation showed skymap
never filtered fingers out — the cross-match dedup deliberately keeps same-sightline
pairs (5 arcsec AND |Δz|/(1+z) < 1% must BOTH trip) — but the SDSS r < 17.77
spectroscopic flux limit thins cluster members with distance, and tier subsampling
(brightest-N by absolute magnitude) thins them further. A DESI patch is ~4× denser
than SDSS at low z and carries four tracer populations stacking into a continuous
deep cone.

## Decisions (from brainstorming, 2026-07-07)

1. **Permanent source**, full `add-data-source` treatment: registry entry, settings
   toggle, R2 deploy. Not a local one-off.
2. **Live in-app clip** — authored with the existing clip driver (`clip@95`),
   `playClip`, scene cues. No recorder work; frame capture to video stays a
   separate future project on the frame-clock roadmap.
3. **DESI DR1 LSS clustering catalogs** over an SDSS patch query (below z = 0.8 the
   existing SDSS bins already contain everything — same flux limit, so fingers get
   no denser) and over pencil-beam surveys (tiny fields, more parsers, no QSO tail).
4. **Cone center: Corona Borealis supercluster, RA 233.2°, Dec +32.3°, radius 2.5°.**
   Chosen by a live density spike over all eight tracer×cap files (methodology
   below). CrB packs several rich Abell clusters (A2065, A2061, A2067, A2079) at
   z ≈ 0.07–0.11 — multiple guaranteed fingers, not density luck — and is ~2×
   denser than the runner-up candidates in every galaxy tracer. The exact center
   may shift ≤ 2° once the files are local and exact counts are free.

## Verified facts (2026-07-07 spike, live against data.desi.lbl.gov)

Sampling: 200 range-request windows × 400 rows per file, all 8
`<TRACER>_<CAP>_clustering.dat.fits` files (v1.5). Rows are HEALPix-ordered, so
spread byte offsets sample spread sky; uniform-over-rows sampling makes
sampled-count-per-disc proportional to true count. Estimated counts carry
roughly ±20–40% error from window clumping (a window's 400 consecutive rows land
in one sky spot).

- **File row counts** (NAXIS2): BGS_BRIGHT 2,909,876 NGC / 1,047,989 SGC;
  LRG 1,476,135 / 662,492; ELG_LOPnotqso 1,821,322 / 610,750;
  QSO 793,219 / 430,172. Row stride 117 bytes, 18 columns — matches the June
  research doc exactly.
- **CrB cone (233.2, +32.3, r = 2.5°) estimated rows:** BGS ~14.5k (z 0.03–0.46),
  LRG ~15.1k (0.40–1.10), ELG ~21.3k (0.80–1.60), QSO ~5.5k (0.80–3.47).
  **Total ≈ 56k** — comfortably a tier-agnostic single bin.
- **Coma is NOT in the DR1 LSS footprint** — a reference disc at (194.95, +27.98)
  returned zero rows in all four tracers. Any Coma-based plan is dead on arrival.
- **The Stripe 82 bright patch** the user spotted in SDSS at (334.42, +0.15) is a
  real z ≈ 0.1 cluster complex (979 of its 1,657 SDSS-CSV rows at z ≈ 0.1). DESI
  covers it in all four tracers (~30.5k rows/cone) — a viable second cone if ever
  wanted, but CrB won on density.
- **The server rate-limits concurrency, not just long reads.** 24 parallel range
  requests → HTTP 503; 6 workers with exponential backoff is reliable. This is a
  fetcher requirement, not a spike anecdote.

## Data pipeline design

### Fetch — `tools/fetch/fetchDesi.ts`

Downloads the four NGC clustering FITS files (CrB is in the north galactic cap)
into `data/raw/desi/`, gitignored, with committed `README.md` + `.sha256`
sidecars. All paths through `rawDataRegistry` (`desi.bgs`, `desi.lrg`, `desi.elg`,
`desi.qso`, `desi.readme`, …), per the add-a-raw-source checklist.

Because the server stalls long sequential reads (~10 MB) AND 503s under high
concurrency, the fetcher pulls ~8 MB range-request chunks, ≤ 6 in flight, with
exponential backoff on 503/timeout and an on-disk resume cache — the
`fetchHyperLeda` pattern. ~820 MB one-time download; reusable verbatim if DESI is
ever promoted to a full source (DR2, ~2027).

Alternative rejected: exploiting HEALPix row-ordering to fetch only the cone's
byte ranges. Less transfer, but it couples the fetcher to patch geometry and
makes the raw files useless for any future re-scoping.

### Parse — `tools/parsers/desiFits.ts`

Minimal FITS binary-table reader: 80-char header cards → `NAXIS1/NAXIS2/TFIELDS`
+ per-column `TTYPE/TFORM` → big-endian column decode. Scope it to the TFORM
letters the LSS files use (`D`, `E`, `K`); anything else throws with the offending
TFORM named. Skymap has NPY and ND-skeleton parsers but no FITS; the format was
proven decodable in ~80 lines during the June spike and re-proven in this one.

Emits `ParsedRecord[]`: RA/Dec/z; magnitudes from nanomaggy fluxes
(`mag = 22.5 − 2.5·log10(flux)`, drop rows with non-positive g or r flux);
g/r/z fluxes → the magG/magR/magI slots; no shape columns → GLADE's no-PA
fallback path (axis ratio 1, fallback flag set).

### Build — `tools/catalog/buildAllBins.ts`

New source in the pipeline: parse the four tracer files, filter to the angular
cone at parse time (dot product against the cone axis > cos 2.5° — cheap, before
any allocation-heavy work), concatenate, and hand the survivors to the existing
`crossMatch` (dedups the low-z overlap with SDSS/GLADE; same-sightline cluster
members survive by design). Positions come from the existing ΛCDM
`redshiftToDistanceMpc` — already accurate past z = 3 (Simpson-integrated
comoving distance, < 1e-6 relative error to z = 10). No new math.

Empty `tierTargets` ⇒ tier-agnostic `desi-deep.bin` (~56k rows ≈ 3.6 MB at
64 B/galaxy), written once per `build-all`, added to the `syncR2` ALLOW list.

### Runtime source

Append-only `Source` enum code + `src/data/sources/desiDeep.ts` entry
(id `desiDeep`, label "DESI Deep Field", `binBaseName: 'desi-deep'`), registered
in `SOURCE_REGISTRY` + `GALAXY_CATALOG_SOURCES`. The `/add-data-source` skill maps
the full edit surface (settings toggle, palette rows, fetcher wiring, bitmask).

Display parameters:

- Colour index from g − r.
- `maxDistMpc ≈ 7100` (z = 3.5 comoving). Milliquas already renders quasars at
  z ≈ 7, so camera, scale bar, and renderer provably survive these distances.
- Far-tail intensity params (`intensityFloor`, `falloffHalfMpc`) seeded from
  Milliquas's values, then tuned visually.
- Luminosity weighting: a single Schechter function is meaningless across four
  mixed tracer populations — use neutral weighting (however the registry
  expresses "no Schechter shaping"; Milliquas is the precedent to copy). Noted
  as a display-tuning knob, not a correctness issue.

## Accepted artifacts (stated, not fixed)

- **The hard cone edge is the point** — it reads as a drill core, not a bug.
- **Tracer n(z) shelves** (BGS→LRG→ELG→QSO transitions) show as gentle density
  steps along the cone. That IS the survey's selection function; the spec accepts
  it, and the InfoCard/provenance README say what each population is.
- **Stays out of the DisPerSE density-field default** (already 2MRS+GLADE-only;
  the SDSS wedge-pollution lesson applies doubly to a cone).

## The clip

Authored entirely on the existing clip system — compile/evaluate/play, scene
cues, `clipOpacityChannel`. No new engine machinery. Launchable standalone
(DebugPanel clip section / command palette), not a grand-tour beat, though the
tour may adopt it later.

Choreography sketch (to be tuned in the authoring plan):

1. Open just outside the CrB complex at ~250–300 Mpc; the Abell-cluster fingers
   of god read as radial spikes aimed at the origin.
2. Slow push through the densest finger — members streaming past.
3. Accelerate outward along the cone axis: LRG shell, then the rich ELG stretch
   (z 0.8–1.6), scene cues fading other survey sources to isolate the cone.
4. QSO tail thins toward z ≈ 3.5; decelerate.
5. Turn-back reveal: the full drill core against the whole map, other sources
   fading back in.

## Testing

- Parser: fixture-driven — a truncated real FITS (header + a few rows, ~4 KB)
  checked in under the tests tree; assert column decode against known values,
  nanomaggy→mag conversion, non-positive-flux drops, unknown-TFORM throw.
- Cone filter: pure-function tests (inside/outside/boundary points).
- Registry/source entry: mirror the existing per-source tests (tier filename
  resolution, bitmask, fetcher URL).
- Fetcher: unit-test chunking/resume bookkeeping with a mocked transport; no
  network in CI.
- Clip: duration/beat checks via the existing `tour-length` tooling
  (`clipDurationSec` for single clips).

## Sequencing

One spec, two plans:

1. **Data source** — fetch → parser → build → runtime entry → R2 sync. Ends with
   the cone visible in the app behind a settings toggle.
2. **Clip authoring** — depends on plan 1's bin existing; small.

The `BACKLOG.md` "DESI DR1 as a data source" item stays (the full survey remains
blocked on the ~10× point ceiling); this spec deliberately ships a scoped patch
that sidesteps the blocker. Cross-reference it from the item line.
