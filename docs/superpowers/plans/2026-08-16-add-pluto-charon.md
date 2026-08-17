# Add Pluto and Charon to the solar-system scene

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pluto and Charon appear in the scene as textured (`medium`/4K — raised from `small`/2k by
Task 8b) bodies riding the existing `planet` source row — no new source, category, toggle, or
settings key. Charon orbits Pluto as an ordinary Moon-style satellite (one-hop `focusId`); Pluto
does not wobble around the real Pluto–Charon barycentre, a documented approximation. Labels,
picking, InfoCard, search, and URL focus all fall out of the existing seed tables with zero new
wiring.

**Context — no separate spec.** The design work for this feature is the grill session at
[`docs/grill-sessions/add-pluto-charon-2026-08-16.md`](../../grill-sessions/add-pluto-charon-2026-08-16.md)
(Q6: a short plan is enough — the survey found zero ground preparation needed). Read it before
this plan; do not re-litigate its decisions. Barycentric orbits, and Pluto's four small moons that
depend on them, are backlogged at
[`docs/backlog/2026-08-16-barycentric-orbit-pairs.md`](../../backlog/2026-08-16-barycentric-orbit-pairs.md).

## Ground preparation

None needed — the 2026-08-16 survey (grill session, codebase-verified) confirmed every touchpoint
is an existing data-gated extension point: `SCENE_PLANETS`/`ORBITAL_ELEMENTS` are append-only
tables read by generic consumers (labels, picking, atmosphere, regions), `BodyTextureId` is a
closed union that forces every downstream texture table to grow in step, and `planet_facts.seed.json`
takes an unstructured "dwarf planet" description with no schema change. Nothing here needs a new
seam.

## Global constraints

- `type` aliases, never `interface`. Deep relative imports, no barrels.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. A comment
  earns its place recording a landmine, a unit, a derivation, or a cross-file contract — never
  restating what the code does. The Charon barycentre-approximation comment is exactly this kind.
- No baked physical constants from memory anywhere in this plan or its tasks: every orbital
  element, radius, pole, and rotation rate is sourced live at implementation time from the cited
  JPL/WGCCRE page and transcribed with its provenance in a row comment, following the existing
  rows' idiom (`ω = ϖ − Ω`, `M = L − ϖ` shown inline; JPL rate columns quoted in the comment).
  Papers (and search results) lie — verify at the source page, not this plan.
- Tests must be able to fail on a real bug no other test or compiler check catches: no constant
  restatements, no mirrors, no clamp-boundary tests. On-disk/generated-table length assertions
  (`rotationElements.test.ts`) are the one class of "restatement" that stays — they pin a load-bearing
  cross-table invariant (`ROTATION_ELEMENTS.length === BodyTextureId union size`), not an arbitrary
  count.
- `SCENE_PLANETS` order is **append-only** — pick indices (`resolvePickTable.ts`'s `body` arm) are
  the row's position in the array. Pluto and Charon are appended at the **end** (after Iapetus),
  never inserted near the other planets, regardless of where they'd sit narratively.
  `ORBITAL_ELEMENTS` has no such constraint (`elementsById` looks up by `id`, and `deriveBodyStates`
  resolves focus order via `focusResolveOrder`, not array position) — its rows may go wherever reads
  best.
- Stage specific paths in every commit; never `git add -A`. Format only touched files.
- `npm test` and `npm run typecheck` stay green at every commit.

---

### Task 1: Palette trail tints for Pluto and Charon

**Files:** `src/data/bodies/palette.ts` (modify)

Add two `Vec3` linear-RGB constants following the existing `<BODY>_<COLOUR>` naming convention
(e.g. `PLUTO_TAN`, `CHARON_GREY`) — dim, max channel ≲ 0.5 like every other trail tint, chosen to
read apart from Neptune's blue and the satellite palette's greys at a glance.

- [x] Add the two constants with a one-line comment if the colour choice needs explaining (it
      probably doesn't — this file's existing rows mostly don't).
- [x] `npm run typecheck` → GREEN (nothing imports these yet).
- [x] Commit `src/data/bodies/palette.ts`.

---

### Task 2: Pluto — `ORBITAL_ELEMENTS` row + `SCENE_PLANETS` row

**Files:** `src/data/bodies/orbitalElements.ts` (modify), `src/data/bodies/scenePlanets.ts` (modify)

**Source:** JPL SSD "Keplerian Elements for Approximate Positions of the Major Planets",
**Table 2a** (valid 3000 BC–3000 AD; the only table that includes Pluto) —
<https://ssd.jpl.nasa.gov/planets/approx_pos.html>. Table 2a's **b/c/s/f** correction terms
(Table 2b, applied to Jupiter through Pluto's mean anomaly for multi-millennial accuracy) are
**deliberately dropped** — `propagateElements.ts` only implements the linear
`element(T) = element₀ + rate·T` map every other row uses, and within a few centuries of J2000 the
linear form is within visual accuracy. Record this tradeoff in a row comment (the "why comment" this
plan's convention calls for) — the sibling Table 1 rows (Mercury–Neptune) don't carry this caveat
because they don't need it.

**Corrected after Task 13, in the final whole-branch review:** the premise above is false. Table 1
carries Pluto too (JPL's _web edition_ dropped it in 2006; the original document did not), and
Table 1 needs no correction terms at all. Table 2a minus its mandatory Table 2b terms is strictly
worse than Table 1 inside 1800–2050, which is the only span the scene clock uses — so the shipped
row is the **Table 1** row, and the dropped-corrections rationale above is gone from the code with
it. The transcription source is the Explanatory Supplement to the Astronomical Almanac, 3rd ed.,
Table 8.10.2, cited in the module header (the JPL page can no longer supply it).

- [x] Add Pluto's `OrbitalElements` row to `ORBITAL_ELEMENTS`, heliocentric (`focusId: 'sun'`, no
      `plane` — Table 2a is ecliptic-referenced like Table 1), following the exact derivation idiom
      the Neptune row (`orbitalElements.ts:296-320`) uses: `a`/`e`/`i`/`Ω` transcribed directly,
      `ω = ϖ − Ω` and `M = L − ϖ` shown inline, the six JPL rate columns quoted in a comment and
      converted the same way (`dω/dt = dϖ/dt − dΩ/dt`, `dM/dt = dL/dt − dϖ/dt`). Use the palette
      constant from Task 1.
- [x] Add Pluto's `PlanetBody` row to `SCENE_PLANETS` via `heliocentricPlanet(...)`, **appended at
      the end of the array** (after Iapetus — see Global constraints). `radiusKm` from WGCCRE 2015's
      updated Pluto size (verify at the source, not from memory); `albedo` a plausible flat tan/grey
      (it's the label-tint and pre-texture fallback colour, not load-bearing once textured).
- [x] `npm run typecheck` → GREEN.
- [x] `npm test -- orbitalElements scenePlanets` → GREEN (no existing assertions should need edits —
      neither table is length-pinned).
- [x] Commit both files.

---

### Task 3: Charon — `ORBITAL_ELEMENTS` row + `SCENE_PLANETS` row

**Files:** `src/data/bodies/orbitalElements.ts` (modify), `src/data/bodies/scenePlanets.ts` (modify)

**Source:** JPL SSD "Planetary Satellite Mean Elements" — the Pluto-system table specifically,
<https://ssd.jpl.nasa.gov/sats/elem/sep.html> (NOT the general `elem.html` the other moons use;
Charon's row lives on this dedicated page). Current reference: Brozović & Jacobson 2024,
_AJ_ 167:256. Charon's elements are **plutocentric** (`focusId: 'pluto'`) — confirm this is what
the page states before authoring the row. The page publishes elements referenced to both the
ecliptic and Pluto's own equatorial plane; use the **equatorial-plane** variant (matching the
`satellite()` maker's Laplace-plane convention every other moon row uses) and Charon's own pole for
`planeFrameFromPole`.

**Landmine comment (mandatory — this is the "looks wrong, don't fix it back" the grill session
requires):** on Charon's row, record that Pluto is pinned at its heliocentric position rather than
orbiting the Pluto–Charon barycentre (which sits ~2,130 km from Pluto's centre — 1.8 Pluto radii,
~11% of the pair separation) — the same approximation Earth–Moon already makes, just far more
visible here because Charon is 12% of Pluto's mass. Link
[`docs/backlog/2026-08-16-barycentric-orbit-pairs.md`](../../backlog/2026-08-16-barycentric-orbit-pairs.md)
as where the real fix lands.

- [x] Determine whether the source page gives periods (`P`/`Papsis`/`Pnode`, the `elem.html` shape
      the `satellite()` maker's `moonRatesFromPeriods` expects) or per-century rates directly (the
      `approx_pos.html` Table-1 shape). If periods: build the row via `satellite({ ... })` exactly
      like every other moon. If rates: author the row directly against `OrbitalElements` following
      the planet-row idiom instead, since `satellite()` is periods-only. Either way, transcribe the
      full source line verbatim in a comment, matching every existing row's provenance discipline.
- [x] Charon's orbit is very nearly circular (e ≈ 0.0002 per public references — **verify the exact
      published value**, don't assume): if going the `satellite()` route, check whether the
      apsidal-precession period is near-degenerate the way Deimos's/Dione's/Tethys's are
      (`orbitalElements.ts:377-395,538-556`) — if so, `moonRatesFromPeriods`'s `MIN_PRECESSION_YEARS`
      guard already freezes that rate to zero; no special-casing needed, just don't be surprised by
      it.
- [x] Add Charon's `PlanetBody` row to `SCENE_PLANETS` via `satelliteBody(...)`, **appended at the
      very end of the array** (after Pluto's Task 2 row). `radiusKm` from WGCCRE 2015 (the USGS
      Astropedia record for the Charon mosaic cites ~606 km as the adopted radius — cross-check
      against WGCCRE 2015 directly, not this plan). `albedo` a plausible flat icy-grey.
- [x] `npm run typecheck` → GREEN.
- [x] `npm test -- orbitalElements scenePlanets bodyRegions` → GREEN. `bodyRegions.test.ts` compares
      region extents by ratio/factor, not a literal AU figure, so the `solar-system` region growing
      from Neptune's ~30 au to Pluto's ~31 au (J2000 snapshot) should NOT require any test edit —
      confirm this rather than pre-emptively touching the test file.
- [x] Commit both files.

---

### Task 4: VISUAL CHECKPOINT — flat-albedo bodies in scene, pre-texture

No code change. Pluto and Charon now exist as ordinary (untextured, flat-albedo) scene bodies with
real J2000 positions, orbit trails, name captions, and picking — the minimum renderable state.

- [x] Start (or reuse) the dev server. Ask the user to fly to the outer solar system and confirm:
      Pluto appears near ~30–39 au from the Sun as a flat tan/grey sphere with a name caption and
      orbit trail; Charon appears as a small satellite orbiting close beside it, also captioned and
      trailed; both are clickable and open an InfoCard (facts land in Task 11, so the card may show
      only the name + Wikipedia stub for now — that's expected at this checkpoint).
- [x] Do not proceed to Task 5 until the user confirms.

---

### Task 5: Texture identity — `BodyTextureId`, `BODY_TEXTURE_REGISTRY`, `TEXTURE_SOURCES`, `RAW_DATA`

**Files:** `src/@types/data/BodyTextureId.d.ts` (modify), `src/data/bodies/bodyTextureRegistry.ts`
(modify), `tools/utils/io/textureSources.ts` (modify), `tools/utils/io/rawDataRegistry.ts` (modify),
`tests/tools/fetch/fetchTextures.test.ts` (modify)

**Sources (verified live via search, not memory):**

- Pluto: `https://planetarymaps.usgs.gov/mosaic/Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif`
  — 296 MB.
- Charon: `https://planetarymaps.usgs.gov/mosaic/Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif`
  — 77 MB.

Both are USGS Astrogeology New Horizons LORRI+MVIC global mosaics, 300 m/px, 8-bit stretched from
the original 32-bit data, equirectangular. **Verify on download whether each is single-channel or
RGB** (`sharp(...).metadata().channels`) — neither filename carries the `ClrMerge`/`ClrMosaic`
infix Io's and Ganymede's do, which on the existing naming convention (Europa's and Callisto's mono
sources are plain `_global_mosaic_`) suggests both are grayscale and need `grayscaleTint`, matching
the Europa/Callisto precedent — confirm, don't assume.

**`BodyTextureId` — the closed-union edit:**

```ts
export type BodyTextureId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'moon'
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'pluto'
  | 'charon';
```

Update the module's docblock: "thirteen members" → "fifteen members".

**`BODY_TEXTURE_REGISTRY` rows:** both `kinds: { surface: 'small' }`, `provenance: 'usgs'`. The
`small` ceiling is a **look ceiling for a different reason than Uranus/Neptune** — not "physically
featureless", but "only the encounter hemisphere is well-resolved; the anti-Charon hemisphere is
reconstructed at much lower fidelity" (grill session Q2). Write this distinction explicitly in the
row comment — the module header already warns against conflating look-ceiling and source-ceiling
reasons.

**`TEXTURE_SOURCES` rows:** `{ surface: { native: 'textures.usgsPluto' } }` and
`{ surface: { native: 'textures.usgsCharon' } }` — no `devKey`/`devFilename`, matching the four USGS
Galilean-moon rows (no cheap dev variant exists).

**`RAW_DATA` rows** (`textures.usgsPluto`, `textures.usgsCharon`): `path` under
`data/raw/textures/`, `kind: 'file'`, `source: 'gitignored'`, `upstream` the two URLs above,
`fetcher: 'tools/fetch/fetchTextures.ts'`, `readme: 'textures.readme'`, following the exact shape
of `textures.usgsIo` etc. (`rawDataRegistry.ts:764-807`).

- [x] Update `fetchTextures.test.ts`'s full-pull filename array (`~line 50`) to add
      `'Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif'` and
      `'Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif'` — RED until the `TEXTURE_SOURCES`
      row lands. The `--dev` subset list (`~line 32`) is **unchanged** (no dev variant for either).
- [x] `npm test -- fetchTextures` → RED.
- [x] Make the four edits above (type union, registry row, sources row, raw-data rows).
- [x] `npm test -- fetchTextures && npm run typecheck` → GREEN. This will also surface every other
      closed-union compile error downstream (`BODY_TEXTURE_REGISTRY`, `ROTATION_ELEMENTS` are
      **not** yet updated — `ROTATION_ELEMENTS` stays keyed by `id: string`, not `BodyTextureId`, so
      it won't fail to compile; it's just incomplete until Task 9) — resolve only what's actually
      red.
- [x] Commit all five files.

---

### Task 6: Fetch the raw texture sources — ANNOUNCE FIRST

The two files total **~373 MB** (296 MB + 77 MB). This is a real download — announce it and get
explicit go-ahead before running anything, per the project's big-download convention.

- [x] Tell the user: "Fetching the Pluto + Charon USGS mosaics will download ~373 MB into
      `data/raw/textures/`. OK to proceed?" and wait for confirmation.
- [x] On approval, run `npm run fetch-textures -- --confirm` (the full pull re-fetches only what's
      missing — `skipIfAlreadyFetched` skips anything already verified on disk).
- [x] Confirm `data/raw/textures/textures.sha256` gained two new lines automatically (the fetcher
      upserts them; no hand edit).
- [x] No commit of the raw `.tif` files themselves (gitignored); commit only the sha256 sidecar if
      git shows it as changed.

---

### Task 7: Attribution

**Files:** `ATTRIBUTIONS.md` (modify)

The existing USGS block (`~line 353`) is scoped to "Galilean moon mosaics" (Voyager + Galileo SSI)
— a different mission from New Horizons. Add a **new** subsection rather than folding Pluto/Charon
into that one.

- [x] Add a "USGS Astrogeology — Pluto/Charon mosaics (New Horizons)" subsection: use (global
      surface mosaics for Pluto and Charon, LORRI + MVIC), source
      (<https://planetarymaps.usgs.gov/>), licence (public domain; verify the exact credit line from
      the Astropedia record — likely "NASA/JHUAPL/SwRI/USGS", don't guess).
- [x] Commit `ATTRIBUTIONS.md`.

---

### Task 8: Build the tiered textures

**Files:** none (generated output only: `public/data/images/textures/pluto-*.jpg`,
`charon-*.jpg`, `body-atlas.webp`, `src/data/bodies/bodyAtlas.generated.ts`)

- [x] Run `npm run build-textures`.
- [x] Confirm the log shows `ok pluto-small.jpg` and `ok charon-small.jpg` (the only tier — `small`
      is the registry ceiling) with the `(tinted)` note iff Task 5's channel check found mono
      sources.
- [x] Confirm `bodyAtlas.generated.ts`'s `BODY_ATLAS_LAYOUT` now has 15 entries and the atlas grid
      stays 4 columns × 4 rows (15 ≤ 16 cells — no grid growth). Confirm the logged atlas byte size
      stays under the 1 MB boot budget (`writeBodyAtlas.ts`'s `BUDGET_BYTES`).
- [x] Commit `src/data/bodies/bodyAtlas.generated.ts` (generated, but committed like every other
      generated codegen file in this tree). The `public/data/images/textures/` output is a build
      artefact — confirm it's gitignored like the rest of that directory before staging anything.
- [x] Visual spot-check in the dev server: Pluto now shows Tombaugh Regio (the "heart") on its
      New-Horizons-facing hemisphere; Charon shows its Mordor Macula polar cap.

---

### Task 8b: 4K tier for both bodies — colour source rejected on the honesty gate (2026-08-17)

Added after Tasks 1–8 shipped, when the flat-tint result made the fidelity gap concrete: multiplying
a panchromatic LORRI mosaic by one `grayscaleTint` renders Pluto a uniform butterscotch and cannot
express the dark red Cthulhu Macula beside pale Tombaugh Regio. The task originally proposed
switching Pluto to a NASA/JHUAPL/SwRI colour mosaic; that half failed verification (below) and was
dropped rather than shipped.

**Gate:** any texture this renderer ships as a body's surface must be approximately true colour —
the same bar the atmosphere work was held to. The only candidate global Pluto colour product,
[PIA11707](https://photojournal.jpl.nasa.gov/catalog/PIA11707) ("Pluto Global Color Map"), is built
from the exact MVIC 3-filter data Olkin et al. 2017 (_AJ_ 154, 258) describes — the mission's own
paper on that dataset states outright: **"These images are enhanced color (not natural color as
perceived by the human eye)."** The one genuinely true-colour Pluto product,
[PIA19857](https://photojournal.jpl.nasa.gov/catalog/PIA19857), is a single hemisphere with a
coverage gap, not a gap-free global map, so it can't back a `surface` texture either. No gap-free
true-colour global Pluto mosaic exists — the colour half of this task fails the gate outright.

**Ruling:** both bodies keep the existing greyscale panchromatic USGS mosaics and their measured
`grayscaleTint` (Task 5) unchanged. Only the tier ceiling moves: `small` → `medium` (4K) for both —
the USGS sources measure 24888 px (Pluto) and 12693 px (Charon) wide, far past the 8k `large`
ceiling, so `medium` is a wire-cost/detail choice, not a source limit; `large` would spend bandwidth
no eye can resolve on a body this small on screen.

- [x] Verify true-vs-enhanced at the primary source — FAILED the gate (Olkin+2017 quote above);
      colour source dropped, not adopted.
- [x] `bodyTextureRegistry`: Pluto and Charon both move `surface: 'small'` → `'medium'`;
      `grayscaleTint` unchanged on both. Row comment rewritten to state the `medium` ceiling as a
      wire-cost/detail balance (look ceiling, not source ceiling) and the far-side coverage gap as a
      fidelity caveat about the data, not a resolution ceiling.
- [x] Rebuild textures + atlas; confirm `pluto-4096.jpg` and `charon-4096.jpg` are both emitted WITH
      the `(tinted)` note (both stay mono sources — no colour source was adopted).

---

### Task 8c: calibrated pan-sharpen for Pluto — a derived colour, not a source swap (2026-08-17)

Added after Task 8b, revisiting the flat-tint call with a different tool than "swap the source": Task
8b correctly found that no gap-free true-colour global Pluto map exists to swap in directly — that
finding stands, unchanged. What's new is combining Pluto's two existing sources instead of picking
one: luminance from the high-resolution panchromatic USGS mosaic (unchanged, still `medium`/4K), hue
from PIA11707's enhanced MVIC colour map with its published saturation enhancement undone by a fitted
linear map on the chroma plane (`ColourTreatment`'s new `panSharpen` variant, `ChromaCalibration`
type, `writePanSharpenedTier` in `buildTextures.ts`). PIA11707 itself is never shipped; only Pluto's
existing mono mosaic and this derived chroma reach the runtime texture.

The calibration's basis and coefficients were reconstructed empirically (not read off a paper) and
validated against NASA's "True Colors of Pluto" natural-colour disc view: reference disc mean
`1.0000 : 0.9385 : 0.8546` (R:G:B, encoded), shipped-code disc mean `1.0000 : 0.9419 : 0.8683` — ΔG =
+0.003, ΔB = +0.014, RMS 0.010. A side-by-side render matches the reference in hue (butterscotch north
polar band, brown — not pink — Cthulhu Macula, pale Sputnik Planitia). The basis and anisotropy
`ChromaCalibration`'s coefficients assume are documented on that type; the empirical derivation and
validation method are in this branch's colour-C commit and its review trail.

Charon is unaffected: it stays `monoTint` because no global colour map exists for it at all (only
single-hemisphere disc portraits), and it is genuinely near-neutral but for a small reddish polar cap
(Grundy+16) — a flat tint is what its source supports, not a shortfall against Pluto's treatment.

**Honest limits, not resolved by this task:** the far-side (anti-encounter) hemisphere has no New
Horizons colour data at all, so its chroma is extrapolated from the panchromatic mosaic's shape, not
observed; the fitted transform also absorbs whatever processing NASA's own reference and colour
products applied upstream, so it is a match to those two products, not an independent radiometric
calibration; this is a derived, best-effort colour reconstruction, not a calibrated science product.

- [x] `ColourTreatment` gains `panSharpen`; `bodyTextureRegistry`'s Pluto row moves from `monoTint` to
      `panSharpen` with the fitted `ChromaCalibration`. Charon stays `monoTint`.
- [x] `ATTRIBUTIONS.md` updated: the USGS mosaic entry now describes Pluto's mosaic as feeding
      luminance for a derived product, not as a directly tinted output.

---

### Task 9: `ROTATION_ELEMENTS` rows for Pluto and Charon

**Files:** `src/data/bodies/rotationElements.ts` (modify), `src/@types/data/BodyTextureId.d.ts`
(docstring only, if not already done in Task 5)

**Source:** Archinal et al. 2018 (WGCCRE 2015 report), which explicitly updated the pole and
rotation rate for Pluto, Charon, and their sizes (confirmed via the report's own summary — this is
not a guess). Both bodies get ordinary rows from that report's tables, same as the other thirteen.

**Landmine comment (mandatory):** Charon's `spinRateDegPerDay` must equal `360° / Charon's orbital
period` (Task 3's row) to the precision WGCCRE publishes — the Pluto–Charon system is _mutually_
tidally locked (each always shows the same face to the other), unlike the Moon which is only
one-way locked to Earth. Record this as the "why" the two numbers agree, not a coincidence to
silently accept.

- [x] Add Pluto's and Charon's rows to `ROTATION_ELEMENTS` (α₀, δ₀, W₀, spin rate — transcribed with
      provenance, same idiom as the other thirteen rows).
- [x] Update the module header: "thirteen rows" → "fifteen rows"; update the "eight major planets,
      the Moon, and Jupiter's four Galilean moons" enumeration to include Pluto and Charon.
- [x] `npm run typecheck` → GREEN.
- [x] Commit both files.

---

### Task 10: Re-pin `rotationElements.test.ts`

**Files:** `tests/data/bodies/rotationElements.test.ts` (modify)

- [x] Change `expect(ROTATION_ELEMENTS).toHaveLength(13)` → `toHaveLength(15)`. The comment above it
      ("The 13 textured bodies (spec §3)") becomes "The 15 textured bodies".
- [x] `npm test -- rotationElements` → GREEN.
- [x] Commit.

---

### Task 11: Facts seed

**Files:** `data/seeds/planet_facts.seed.json` (modify)

Two new entries, validated by `validatePlanetFactsEntry` (only `id` and `wikiTitle` are required;
every other field is an optional display string). Description copy must say **dwarf planet** for
Pluto and **binary pair** (or equivalent) for the Pluto–Charon relationship on at least one of the
two entries — this is the entire mechanism by which "honest about dwarf-planet status" ships (no
schema field for it; it's prose, per the grill session's Q1 decision).

- [x] Add Pluto's entry: `id: 'pluto'`, `wikiTitle: 'Pluto'`, `moons` (Pluto has 5 known moons even
      though only Charon is rendered — say so honestly, don't imply only one exists), `distance` in
      AU, `description` naming it a dwarf planet and Kuiper Belt object, mentioning Tombaugh Regio.
- [x] Add Charon's entry: `id: 'charon'`, `parent: 'Pluto'`, `wikiTitle: 'Charon_(moon)'`,
      `dayLength: 'Tidally locked (mutual)'` or similar language distinguishing it from the Moon's
      one-way lock, `description` naming the Pluto–Charon binary/double-planet relationship and
      Mordor Macula.
- [x] `npm run build-planet-facts` → regenerates `bodyFacts.generated.ts`; confirm it now contains
      `pluto` and `charon` keys.
- [x] `npm test -- planetFactsSeed` → GREEN (generic validator test, no per-body assertions to
      update).
- [x] Commit `data/seeds/planet_facts.seed.json` and the regenerated `bodyFacts.generated.ts`.

---

### Task 12: Full-suite verification

**Files:** none

- [x] `npm run typecheck` → GREEN (both `src` and `tools` configs).
- [x] `npm test` → GREEN. In particular confirm `bodyRegions.test.ts` and
      `foregroundMaxDistance.test.ts` pass unmodified — both compare region extents by ratio
      against the dominant `solar-neighbourhood` region (~2.3 kpc), which the `solar-system`
      region's ~30→~31 au growth doesn't come close to disturbing (`foregroundMaxDistance.ts` maxes
      over ALL region extents, and `solar-neighbourhood` already dwarfs `solar-system` by six
      orders of magnitude before this change).
- [x] `npm run fetch-textures -- --dev` → still succeeds and does not attempt Pluto/Charon (no dev
      source registered for either, matching the Galilean-moon precedent) — confirms Task 5 didn't
      accidentally add a `devFilename`/`devKey`.
- [x] Grep the diff for any leftover `'planet'`/`'body'` id literal that should have been `'pluto'`/
      `'charon'` but wasn't — a sanity pass, not a new mechanism.

---

### Task 13: FINAL VISUAL PASS — the pair, with time running

- [x] In the dev server, fly to Pluto/Charon. Confirm: both are textured (Tombaugh Regio, Mordor
      Macula); clicking either opens an InfoCard with the seeded facts and "dwarf planet"/"binary
      pair" copy; command-palette search finds "Pluto" and "Charon"; the URL hash updates to
      `#body-pluto` / `#body-charon` on focus and a fresh load of that URL refocuses correctly.
- [x] Advance the sim clock (or let it run) and watch Charon over one orbit (~6.4 days of sim time,
      sped up): confirm the same hemisphere of Charon stays turned toward Pluto throughout — the
      tidal-lock geometry Task 9's landmine comment promises.
- [x] Confirm the single existing "planet" visibility toggle in Settings shows/hides Pluto and
      Charon along with every other planet — no new toggle appeared anywhere.
- [x] Report the outcome to the user; do not mark the plan done until they've confirmed the visual
      pass themselves.

---

## Definition of Done

**Deliverable inventory:**

- Pluto and Charon exist as rows in `SCENE_PLANETS` / `ORBITAL_ELEMENTS` / `ROTATION_ELEMENTS` /
  `BODY_TEXTURE_REGISTRY` / `planet_facts.seed.json`, riding the existing `planet` source with no
  new source, category, settings key, or URL-hash scheme.
- `BodyTextureId` carries `'pluto' | 'charon'`; `TEXTURE_SOURCES` and `RAW_DATA` name the two USGS
  New Horizons mosaics with live-verified upstream URLs; `textures.sha256` and `ATTRIBUTIONS.md`
  cover them.
- Built artefacts: `public/data/images/textures/pluto-4096.jpg`, `charon-4096.jpg` (plus their
  2048 variants),
  `body-atlas.webp` (15-tile layout), `bodyAtlas.generated.ts`, `bodyFacts.generated.ts` all
  regenerated and committed where the project's convention commits generated output.
- The Charon element row carries the barycentre-approximation landmine comment, linked to
  `docs/backlog/2026-08-16-barycentric-orbit-pairs.md`.

**Named observable behaviours (manual smoke pass):**

- Pluto shows Tombaugh Regio; Charon shows its dark polar cap (Neverland Regio, IAU-adopted
  2026-02-02, the "Mordor Macula" of the New Horizons team's nickname).
- Charon visibly keeps one face toward Pluto as sim time advances (mutual tidal lock).
- InfoCard copy for at least one of the pair says "dwarf planet" and describes the binary/double
  relationship.
- Search, pick, label, and URL deep-link all work with zero body-specific code added anywhere in
  those subsystems.
- The single `planet` visibility toggle covers both new bodies.

**Deferral boundary (out of scope — do not chase):**

- Styx, Nix, Kerberos, Hydra — backlogged, blocked on barycentric orbit pairs.
- Pluto wobbling around the Pluto–Charon barycentre — same backlog item; Pluto stays pinned at its
  heliocentric position by design, not a bug to fix in this PR.
- Any new `dwarf-planet` source, category, or settings toggle — explicitly rejected in the grill
  session (Q1); future dwarf planets ride the same `planet` row this one does.
