# Grill Session: Famous Stars Seed + Pipeline — 2026-07-17

Source: user request (2026-07-17 session) — "have most of the named stars in the
night sky named", per the Wikipedia brightest-stars table, with a
`famous_stars.seed.json` in the famous-galaxies mold (descriptions, alternative
names, Bayer designation, spectral type, mass, temperature, age) and a build
pipeline emitting runtime artefacts.

Goal: a curated famous-stars layer — every star a night-sky visitor would
recognise, rendered by the scene-body path with real physical parameters,
searchable by name, and readable in the InfoCard — fed from one committed seed
that is the single source of truth for every named star skymap draws.

Grounding found before Q1: the codebase already has `SCENE_STARS`
(`src/data/bodies/sceneStars.ts`, 26 hand-authored foreground stars ≤ ~10 pc),
`FAMOUS_STAR_GAIA_IDS` (`tools/catalog/famousStarGaiaIds.ts`, the
SIMBAD-resolved Gaia-dedup table consumed by `tools/stars/buildStars.ts` /
`selectStars.ts`), and the famous-galaxies pipeline precedent
(`data/seeds/famous_galaxies.seed.json` → `buildFamous.ts` → `famous.bin` +
`famous_meta.json`). Critically, the visually brightest stars (Sirius, Vega,
Procyon, α Cen, Altair, Fomalhaut, Pollux…) saturate Gaia's detectors and have
**no Gaia DR3 rows** — the Gaia star bin can never draw them, so a famous-stars
layer is the only path for the night sky's most recognisable stars beyond
10 pc.

---

## Q1: What IS a famous star at runtime — relation to SCENE_STARS and the Gaia bin?

**The question:** The repo already draws named stars two ways: hand-authored
`SCENE_STARS` foreground bodies (descent spheres/points ≤ ~10 pc) and the
incoming Gaia star bin (anonymous, non-pickable). Where does the new seed sit —
a third parallel layer, or the source of truth the existing layers derive from?

**Considerations:**

- **Option A (separate new layer):** `famous_stars.seed.json` → own bin + meta
  - renderer path; `SCENE_STARS` stays a hand-authored TS constant. Pros: no
    churn in existing files. Cons: Sirius defined twice (TS constant AND seed),
    dedup needed in three directions (famous↔scene, famous↔Gaia, scene↔Gaia),
    classic two-sources-of-truth entanglement the simplicity conventions flag.
- **Option B (seed absorbs SCENE_STARS):** one seed is the single source of
  truth for every named star; the descent's foreground bodies become a derived
  view of it. Pros: position/magnitude/metadata can never disagree between the
  sphere you fly past and the labeled point seen from afar; one dedup table,
  one direction (seed↔Gaia). Cons: more up-front work — touches
  `sceneStars.ts` and the Gaia-dedup key.

**Decision:** Option B — the seed absorbs `SCENE_STARS`; `sceneStars.ts`
becomes derived from the seed. User explicitly confirmed being comfortable
with the derivation.

## Q2: Which stars make the cut?

**The question:** "Most of the named stars in the night sky" has readings
ranging from ~93 to ~480 entries — which selection rule bounds the curation?

**Considerations:**

- **Option A (Wikipedia brightest-stars table):** ~93 stars down to apparent
  V +2.50. Every one has a proper name and rich Wikipedia coverage. Cons:
  misses faint-but-famous stars (Proxima, Barnard's) the scene already draws.
- **Option B (all IAU proper names):** ~480 stars. Complete but the tail is
  obscure (NameExoWorlds campaign names), descriptions get thin, and the
  curation effort roughly quintuples.
- **Option C (union):** brightest table (~93) ∪ existing 26 `SCENE_STARS`
  (mandatory anyway per Q1; ~7 overlap, so +19 faint nearest stars) ∪ a short
  hand-picked "iconic for other reasons" set (~10: Mira, Algol, Albireo,
  η Car, 51 Peg-class exoplanet hosts…). ~115–125 entries: everything a
  visitor would search for, still hand-curatable at famous-galaxies quality.

**Decision:** Option C. Exact "iconic extras" list chosen at seed-authoring
time, kept short (~10).

## Q3: How do the far bright stars get drawn?

**The question:** Existing scene stars top out at Pollux (~10 pc); the bright
list reaches Betelgeuse (~170 pc), Rigel (~260 pc), Deneb (~800 pc). Which
render path draws them?

**Considerations:**

- **Option A (extend the foreground body path):** all seed stars become scene
  bodies — `starPointsLayer` backdrop points, `sceneBodyLabels` captions,
  `starSpheresLayer` true-scale spheres on approach, and they inherit
  foreground-body picking when that lands. One path, no new renderer, ~120
  points is trivial draw cost. Known consequence: the derived
  `FOREGROUND_MAX_DISTANCE_MPC` (farthest body × 1000) would jump ~10 kpc →
  ~0.8 Mpc with Deneb, violating the pinned "two decades below 1 Mpc"
  property — the ×1000 margin needs rederiving (e.g. ×10 still covers the
  backdrop-framing rationale). Adjacent to the "Star field → own slab"
  backlog item.
- **Option B (new dedicated famousStars layer):** clean separation but
  duplicates exactly what the bodies path does (points, captions, future
  picking) for the same kind of object — a parallel path with no structural
  reason.
- **Option C (inject into the Gaia star-bin renderer):** rejected out of
  hand — that layer is explicitly non-pickable and label-free; famous stars
  exist to be named and clicked. (And the brightest ones aren't in Gaia
  anyway.)

**Decision:** Option A, with the margin rederivation explicitly in scope
(one constant's derivation + its test).

## Q4: Pipeline artefacts — is a .bin warranted?

**The question:** The original ask was "a bin and a meta sidecar" mirroring
famous galaxies. But `famous.bin` exists because the galaxy point renderer
eats `GalaxyCatalog` ArrayBuffers; per Q3, famous stars feed the scene-body
path, whose input is a tiny synchronous TS structure at engine init
(`createEngineData`). The real constraint: bodies are consumed synchronously,
but ~100 KB of descriptions shouldn't ride in the JS bundle.

**Considerations:**

- **Option A (split at build):** committed seed → `buildFamousStars` emits
  (1) a compact **committed generated** star table (id, label, ra, dec,
  distPc, absMag, spectral class…) that `sceneStars.ts` imports synchronously
  — "GENERATED, do not edit" header, so typecheck/CI/dev need no build step —
  and (2) `public/data/famous_stars_meta.json`, the id-keyed sidecar with
  descriptions + physical properties, lazily fetched for the InfoCard
  (exactly `famous_meta.json`'s role), synced to R2. Pros: sidecar pattern
  kept, init stays synchronous, no format invention. Cons: a committed
  generated file.
- **Option B (bin + sidecar, literal mirror):** invent a tiny star-bin format
  (or reuse SKST), fetch at runtime, make foreground-body init async.
  Structural churn in `createEngineData` for zero payload benefit at ~6 KB.
- **Option C (no pipeline):** import the seed JSON straight into the bundle,
  descriptions included (~25–35 KB gzipped). Simplest, but abandons the
  sidecar pattern and ships text 99 % of sessions never open.

**Decision:** Option A — no bin; committed compact generated table + fetched
meta sidecar. The committed-codegen wrinkle accepted explicitly.

## Q5: One entry per naked-eye star, or per physical component?

**The question:** Many of the brightest "stars" are systems (α Cen A+B,
Capella's quadruple, Sirius A+B, Acrux, Castor ×6). What does one seed entry
model?

**Considerations:**

- **Option A (one entry per naked-eye point of light):** the seed models what
  you see; properties (`massSolar`/`temperatureK`/`ageGyr`) are the
  primary's, companions live in the description. Matches `SCENE_STARS`'
  stated selection rule (A/B merged into primary — except Proxima, kept
  separate as a named object and the parsec-scale f64 test anchor). Keeps
  physical fields well-defined by a schema-level rule.
- **Option B (per-component entries):** physically honest, but doubles
  curation for visually inseparable objects, stacks two labels on one
  apparent point, and asks the renderer to depict binaries it can't resolve
  at these scales.

**Decision:** Option A — system = one entry, properties = primary, companions
in the description; Proxima remains its own entry.

## Q6: The seed schema

**The question:** Which fields, in which units — and which "other interesting
info" gets promoted to structured fields vs living in the description?
Mid-question the user set the bar: descriptions matter, and the seed must
carry **all the info needed to generate a "realistic" 3D star model**.

**Considerations:** the base proposal (id, commonName, names[], constellation,
ra/dec J2000 deg, distancePc, magV, absMag, spectralType, massSolar,
temperatureK, ageGyr, description) was amended by the realism requirement:

- `temperatureK` becomes load-bearing: surface colour derives from blackbody
  temperature (real chromaticity), not the 4-bucket spectral palette.
- `luminositySolar` (bolometric) promoted to a field — absMag is V-band and
  the bolometric correction is huge at the extremes (Rigel ~120 000 L☉; M
  dwarfs emit mostly IR); emissive intensity needs the real number.
- `radiusSolar` — feeds `radiusKm`, retiring the maker's explicit 1 R☉
  placeholder ("until a later LOD promotion" — `makers/star.ts`); Betelgeuse
  ~760 R☉ vs Sirius 1.7 R☉.
- `oblateness` (optional, omit ≈ spherical) — Achernar (~0.35), Altair,
  Regulus are famously flattened; a sphere for Achernar isn't "realistic".
- `variable` — structured enough to drive InfoCard text and future pulsation
  (type + range).
- Kept in prose, not fields: name etymology, exoplanet hosts (a sentence
  each, no runtime use).
- Schema rules: omit unknown fields (never 0 or guesses); properties are the
  primary's (Q5); `names[0]` = commonName, `names[1]` = Bayer designation.

**Decision:** schema as amended — model-generation vector is
`radiusSolar + temperatureK + luminositySolar + oblateness? + variable? +
spectralType`; descriptions carry etymology/companions/fun facts.

## Q7: Where do the ~120 descriptions come from?

**The question:** Famous-galaxies descriptions are verbatim Wikipedia leads
(the CMB-velocity boilerplate gives it away). Same trick, or curated prose?

**Considerations:**

- **Option A (Wikipedia leads):** consistent, fast, zero hallucination risk —
  but star leads are drier/more repetitive than galaxy leads, against the
  stated "nice description" bar.
- **Option B (curated):** author each description (3–5 sentences: what it is,
  etymology, companions, the one famous fact — Algol's eclipses, Mira's
  11-month vanishing act, Betelgeuse's supernova watch), fact-checking key
  claims against Wikipedia/SIMBAD rather than copying prose. Slower, reads
  like a guide.
- **Option C (hybrid):** fetched lead + rewrite pass — converges to B with
  extra steps.

**Decision:** Option B — curated, fact-checked while authoring.

## Q8: Where does the Gaia dedup key live?

**The question:** `buildStars`/`selectStars` subtract scene-drawn stars from
the Gaia bin via `FAMOUS_STAR_GAIA_IDS` (hand-maintained TS, keyed by
`SCENE_STARS` id, per-row SIMBAD provenance comments). The seed growing to
~120 means ~95 new SIMBAD resolutions — where does that fact belong?

**Considerations:**

- **Option A (in the seed):** required `"gaiaDr3": "<digits>" | null` on every
  entry — string because DR3 source_ids exceed `Number.MAX_SAFE_INTEGER`
  (JSON numbers would silently corrupt them); `null` keeps its meaning
  ("SIMBAD confirms no Gaia DR3 row" — the Sun, saturated bright stars); a
  _missing_ field fails seed validation so "not yet resolved" can't read as
  "nothing to subtract". Optional `"gaiaDr3Note"` carries provenance for
  non-obvious resolutions (component choice in multiples). Cons: loses the
  TS table's comment culture (mitigated by the note field).
- **Option B (keep the separate TS table):** keeps the comments but
  re-creates the two-files-must-agree knot Q1 killed — every seed addition
  needs a matching row elsewhere, enforced only by a test.

**Decision:** Option A. `tools/catalog/famousStarGaiaIds.ts` is deleted
(delete-proxy-surfaces rule); `buildStars` reads the seed. Flagged
consequence: the subtraction list grows 26 → ~120, so the dedup must land
before the first real `build-stars` run (timing is ideal — the Gaia fetch is
still in flight).

## Q9: Runtime surface in v1 — search and InfoCard?

**The question:** How does a user reach Betelgeuse and read the curated
description? Click-picking is the parked foreground-body-picking item; what
ships now?

**Considerations:**

- **Option A (rendering only):** smallest PR, but the descriptions ship dark —
  invisible until picking lands.
- **Option B (rendering + search fly-to):** seed names feed the alias index;
  search flies the camera; InfoCard waits for picking.
- **Option C (rendering + search + star InfoCard now):** full payoff. The
  feared cost — front-running the picking design — turned out mostly moot on
  inspection: `extractSelectionRow` already has a `body` arm resolving
  `{type:'body', id}` refs against `SCENE_BODIES`, the galaxy arm already
  consumes `deps.famousMeta` for exactly this enrichment pattern, and palette
  body search + body focus framing shipped with zoom-to-earth plan 02. Star
  InfoCard = a `famousStarsMeta` dep mirroring `famousMeta` + an enriched
  body arm + InfoCard fields. The unified-pick-spine design notes stay
  untouched.

**Decision:** Option C — search + star InfoCard in scope, riding the existing
body-selection seams. Picking itself remains the parked backlog item;
`famous_stars_meta.json` becomes its ready-made payload.

## Q10: Caption policy for ~120 labeled stars?

**The question:** All 26 stars currently get captions inside the 1 kpc gate
(`SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`); ~120 simultaneous captions at
star-map zoom is planetarium-dense. Gate by magnitude from day one?

**Considerations:**

- **Option A (ship all-on, tune later):** keep existing gates, judge clutter
  in the visual pass; add a `magV` threshold only if needed (the seed carries
  the field either way). ~120 labels is roughly Stellarium's default density
  — it may simply look right. Avoids designing label-LOD machinery blind.
- **Option B (magnitude-gated from day one):** e.g. captions only for
  magV < 1.5 (~25 stars) until the camera closes in. Safer against clutter
  but a second gating mechanism designed before seeing the problem.

**Decision:** Option A, with the explicit expectation that the visual pass may
add a one-line `magV` threshold follow-up.

## Q11: Process and delivery shape

**The question:** How does this ship — ceremony level, curation logistics,
PR/docs structure?

**Decision (accepted as proposed):**

1. This transcript saved to `docs/grill-sessions/famous-stars-2026-07-17.md`.
2. `refactor-ground` runs next, ruling on the ground-prep candidates:
   `sceneStars.ts` → seed derivation seam, `FOREGROUND_MAX_DISTANCE_MPC`
   margin rederivation, palette → blackbody colour, deleting
   `famousStarGaiaIds.ts`. Any prep refactors land on this same branch, not
   as separate prep PRs (user decision — see item 6).
3. Spec + plan authored by subagent; plan split in two if it balloons:
   (a) seed + pipeline + runtime, (b) curation.
4. Curation as plan tasks: subagents author the seed in batches of ~15–20
   stars, fact-checked against Wikipedia/SIMBAD; the ~95 new Gaia DR3
   resolutions go through SIMBAD identifier lists, never positional matching
   (high-proper-motion stars break positional cross-match — the existing
   table's rule). Curation sequenced after the pipeline lands so the
   validator catches schema drift per batch.
5. Timing: seed lands before the first real `build-stars` run, so the Gaia
   bin's dedup is complete on its first build — no rebuild needed.
6. Everything on one branch/PR (user decision, 2026-07-17): grill transcript,
   spec, plan, any prep refactors, and the feature itself all land on
   `worktree-famous-stars-seed-pipeline` — no separate docs or prep PRs.
7. No existing backlog item to sweep (checked).

Work happens in worktree `famous-stars-seed-pipeline`
(branch `worktree-famous-stars-seed-pipeline`).

---

## Refactor-ground checkpoint addendum (2026-07-17, same session)

**Verdict: ground is ready — every touchpoint lands as growth; no prep refactors
needed** (and per Q11 everything stays on this branch regardless). Findings from
the three-explorer ideal-diff pass, plus three user decisions taken at the
checkpoint:

1. **`FOREGROUND_MAX_DISTANCE_MPC` needs NO rederivation** (revises Q3's
   expectation). With Deneb (~800 pc) the derived gate lands at ~0.26 Mpc; the
   pinned assertions (`≥ farthest×100`, `< 1 Mpc`,
   `tests/services/engine/frame/foregroundMaxDistance.test.ts:30-35`) both still
   hold. The derivation absorbs the new seeds automatically — its design intent.
   Headroom to the 1 Mpc ceiling shrinks ~100× → ~4×; spec notes it, no code
   change.
2. **Q4 split-at-build RECONFIRMED after a genuine challenge.** The repo's
   only seed-consumption precedent is a _direct_ Vite JSON import
   (`src/data/structure/buildStaticAnchorStructures.ts:67`) and there is zero
   committed-codegen precedent — so direct import was proposed at checkpoint.
   User rejected it on forward-looking grounds: planets/Earth will want their
   own meta sidecars later, so the sidecar is the durable pattern, and a
   direct import would put descriptions in the bundle making any sidecar
   redundant (JSON imports don't tree-shake fields). Decision: one authoring
   file; `build-famous-stars` emits (a) the committed generated compact table
   `src/` imports (first committed-codegen file in the repo — accepted) and
   (b) `public/data/famous_stars_meta.json`.
3. **Palette search: ungate ALL bodies** (user decision). Body rows exist but
   sit behind the `?deepZoom` URL gate
   (`src/components/CommandPalette/utils/rankPaletteMatches.ts:86-101`) with a
   single searchable name each. The gate is removed for every body kind (no
   per-kind special case); star rows get `names[]` aliases from the seed.
4. **Oblateness: data + render** (user decision). Per-axis scale baked into
   the CPU-side MVP composition (`composeBodyMvp` grows a scale variant) — no
   uniform/shader change; Achernar actually looks flattened.
5. **Star InfoCard + deep links are table-row growth.**
   `buildFocusable`'s body arm is `() => null` today; `FocusableTargetType`,
   `DETAIL_CARD` (`src/components/InfoCard/detailCardTable.ts`), and
   `URL_HASH_FOR` (`src/hooks/urlHashFor.ts`) are keyed tables — one new
   row/variant each, plus `StarDetailCard`/`CompactStarCard` (via the
   create-component skill). The `#body-<id>` codec already round-trips
   (`focusIdOf.ts` / `resolveFocusId.ts:119-122`) — deep links come almost
   free.
6. **Misc seams verified:** palette.ts's four star-colour buckets are
   deletable (planet tints are a disjoint constant family); no blackbody
   utility exists anywhere (new `src/utils/color/` leaf util + test);
   `partitionStarsByResolution` already feeds `radiusKm` into the LOD split,
   so real radii activate per-star sphere-promotion distances (the maker's
   "later LOD promotion" placeholder comment anticipated exactly this);
   `buildStars.ts:604-606` needs only a seed-derived `ReadonlySet<bigint>` —
   `famousStarGaiaIds.ts` + its test are deleted, the coverage invariant
   moves into the seed parser tests.
