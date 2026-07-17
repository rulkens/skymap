# Famous Stars — Seed + Pipeline — Design

**Status:** Draft (2026-07-17)

**Goal:** Make one committed seed — `data/seeds/famous_stars.seed.json` — the
single source of truth for every named star skymap draws. A build tool validates
it and emits (1) a committed, generated compact star table that
`src/data/bodies/sceneStars.ts` imports synchronously (so `SCENE_STARS` keeps its
name and every downstream consumer is untouched) and (2) a fetched
`public/data/famous_stars_meta.json` sidecar of descriptions + physical
properties for the InfoCard. The ~120 stars render through the existing
foreground-body path with **real** physical parameters — per-star radius from
`radiusSolar`, surface colour from a blackbody `temperatureK → linear-RGB`
utility, optional oblateness baked as a per-axis scale in the CPU-side MVP — and
become searchable by name and readable in a real star InfoCard.

Full decision ledger (every choice below is fixed there, not re-litigated here):
[`docs/grill-sessions/famous-stars-2026-07-17.md`](../../grill-sessions/famous-stars-2026-07-17.md),
including the refactor-ground checkpoint addendum. Where this spec cites "grill Qn"
or "addendum n", that transcript is the authority.

---

## 1. Motivation & overview

The repo already draws named stars two ways that must not disagree: 26
hand-authored `SCENE_STARS` foreground bodies (`src/data/bodies/sceneStars.ts`,
≤ ~10 pc) and the incoming anonymous, non-pickable Gaia star bin. Critically, the
visually brightest stars a visitor searches for — Sirius, Vega, Procyon, α Cen,
Altair, Fomalhaut, Betelgeuse, Rigel, Deneb — either sit beyond the current 10 pc
scene reach or **saturate Gaia's detectors and have no DR3 row at all**, so the
Gaia bin can never draw them. A curated famous-stars layer is the only path for
the night sky's most recognisable stars.

Rather than add a third parallel layer (Sirius defined in two places, dedup in
three directions), the seed **absorbs** `SCENE_STARS`: the descent's foreground
stars become a *derived view* of one seed, so the sphere you fly past and the
labelled point you see from afar can never disagree, and the Gaia dedup runs in
exactly one direction (seed ↔ Gaia) (grill Q1, Option B).

Selection is a union (grill Q2, Option C, ~115–125 entries):

```
Wikipedia brightest-stars table (~93, down to V +2.50)
  ∪  existing 26 SCENE_STARS   (mandatory per Q1; ~19 faint nearest stars net)
  ∪  ~10 hand-picked "iconic for other reasons" (Mira, Algol, Albireo, η Car, a
      51-Peg-class exoplanet host, …) chosen at seed-authoring time
```

All ~120 render through the existing scene-body path (grill Q3, Option A):
`starPointsLayer` backdrop points, `sceneBodyLabels` captions, `starSpheresLayer`
true-scale spheres on approach, and (when it lands) foreground-body picking — one
path, no new renderer, ~120 points is trivial draw cost. The furthest entry
(Deneb, ~800 pc) is inside the reach the foreground gate already derives
(§6).

Everything lands on the one branch `famous-stars-seed-pipeline` — grill transcript,
this spec, the plan, and the feature — with no separate prep or docs PRs (grill Q11
item 6). The refactor-ground pass ruled the ground ready with no prep refactors
(§11).

---

## 2. Seed schema

One authoring file, `data/seeds/famous_stars.seed.json`: a JSON array of entries.
Human-readable units, hand-curated, the single source of truth. Schema locked at
grill Q6 + the checkpoint addendum. The parser type (`tools/parsers/famousStarsSeed.ts`,
§4) is the contract:

```ts
// tools/parsers/famousStarsSeed.ts   (type alias, never interface — CLAUDE.md)
export type FamousStarEntry = {
  /** kebab-case, stable, URL-safe; the id every artefact keys on. */
  id: string;
  /** Curated display name (e.g. "Betelgeuse"). Equals names[0]. */
  commonName: string;
  /**
   * Ordered aliases: names[0] === commonName (required). By CONVENTION names[1]
   * is the Bayer designation (e.g. "Alpha Orionis") when one exists — but many
   * nearest stars (Barnard's Star, Ross 154, Luyten 726-8, Wolf 359) have no
   * Bayer name, so names[1] is NOT required. After the headline come any
   * catalogue/traditional names. The palette searches all of them; the InfoCard
   * shows names[0] as headline, the rest as "also known as".
   */
  names: string[];
  /** IAU constellation (full name, e.g. "Orion"). Palette secondary chip. */
  constellation: string;
  /** J2000 Right Ascension, degrees [0, 360). */
  ra: number;
  /** J2000 Declination, degrees [-90, 90]. */
  dec: number;
  /** Distance, parsecs (>= 0; the Sun's entry is 0). Curated (Hipparcos/Gaia-era), never cz-derived. */
  distancePc: number;
  /** Apparent V magnitude. Carried for a future caption-density gate (Q10). */
  magV: number;
  /** Absolute V magnitude. Drives point brightness/size + the LOD crossover. */
  absMag: number;
  /** Full MK spectral string (e.g. "M1-2 Ia-ab"). InfoCard + provenance. */
  spectralType: string;
  /** Primary radius, R☉. REQUIRED — a render input (feeds radiusKm, retiring the
   *  maker's 1 R☉ placeholder), always estimable. */
  radiusSolar: number;
  /** Effective surface temperature, K. REQUIRED — a render input (drives surface
   *  colour), always estimable. */
  temperatureK: number;
  /** Primary mass, M☉. OPTIONAL — omit when genuinely unknown (never a guess). */
  massSolar?: number;
  /** Bolometric luminosity, L☉. OPTIONAL — omit when unknown. (absMag is V-band;
   *  the BC is huge at extremes.) */
  luminositySolar?: number;
  /** Age, Gyr. OPTIONAL — omit when unknown (never a guess). */
  ageGyr?: number;
  /** Flattening (a-c)/a, (0, ~0.5). OMIT when ≈ spherical. Achernar ~0.35. */
  oblateness?: number;
  /** Structured variability, when applicable. Drives InfoCard text + future pulsation. */
  variable?: { type: string; magRange: [number, number] };
  /**
   * Gaia DR3 source_id as a STRING (DR3 ids exceed Number.MAX_SAFE_INTEGER; a
   * JSON number would silently corrupt them), or null when SIMBAD confirms no
   * Gaia DR3 row (the Sun; saturated bright stars). REQUIRED on every entry —
   * a MISSING field is a validation error, so "not yet resolved" can never
   * read as "nothing to subtract from the Gaia bin". (grill Q8, Option A.)
   */
  gaiaDr3: string | null;
  /** Optional provenance for a non-obvious resolution (which component, etc.). */
  gaiaDr3Note?: string;
  /** Curated prose, 3–5 sentences, fact-checked (grill Q7, Option B). */
  description: string;
};
```

**Field semantics & omission rules (grill Q5, Q6):**

- **One entry per naked-eye point of light.** Multiple systems (α Cen A+B,
  Sirius A+B, Castor ×6) are a single entry; the structured properties
  (`massSolar`/`radiusSolar`/`temperatureK`/`luminositySolar`/`ageGyr`) are the
  **primary's**, companions live in `description`. **Proxima Centauri stays its
  own entry** — it is a named object and the ~1.301 pc f64 test anchor.
- **Omit unknown fields; never write 0 or a guess.** The optional fields
  (`massSolar`, `luminositySolar`, `ageGyr`, `oblateness`, `variable`,
  `gaiaDr3Note`) are absent unless real — mass/luminosity/age are genuinely
  unknown for some entries, and the InfoCard simply omits the line. `radiusSolar`
  and `temperatureK` stay REQUIRED because they are render inputs (radius →
  `radiusKm`, temperature → surface colour) and are always estimable; a guessed 0
  there would silently corrupt the rendered model — the whole point of promoting
  these to structured fields (grill Q6).
- **Kept in prose, not fields:** name etymology, exoplanet hosts, the one famous
  fact (Algol's eclipses, Mira's 11-month vanishing act, Betelgeuse's supernova
  watch). No runtime use, so no field.
- The **model-generation vector** the seed must carry for a "realistic" 3D star
  is `radiusSolar + temperatureK + luminositySolar + oblateness? + variable? +
  spectralType` (grill Q6).

---

## 3. Pipeline artefacts & workflow

No `.bin` (grill Q4, Option A): the scene-body path consumes a tiny synchronous TS
structure at engine init, so the input is not an ArrayBuffer. The build splits the
seed at build time into two artefacts:

```
 data/seeds/famous_stars.seed.json            (committed, single source of truth)
        │
        │  npm run build-famous-stars   (tools/famous/buildFamousStars.ts)
        │  — parses + validates the seed (§4), then emits:
        ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ (1) src/data/bodies/famousStars.generated.ts   COMMITTED generated code  │
 │     the compact render+search projection sceneStars.ts imports (§5)      │
 │                                                                          │
 │ (2) public/data/famous_stars_meta.json         gitignored build artefact │
 │     id-keyed descriptions + physical properties, fetched for the InfoCard│
 │     (§7), synced to R2 — exactly famous_meta.json's role                 │
 └─────────────────────────────────────────────────────────────────────────┘
```

**Why a committed generated file (the repo's first committed-codegen file).**
Reconfirmed at the checkpoint against a genuine challenge (addendum 2): a *direct*
Vite JSON import (the `buildStaticAnchorStructures.ts:67` precedent) was proposed
and rejected on forward-looking grounds — planets/Earth will want their own meta
sidecars later, so the sidecar is the durable pattern, and a direct import would
put descriptions in the JS bundle (JSON imports don't tree-shake fields), making
any sidecar redundant. Splitting keeps init synchronous (no `createEngineData`
async churn), keeps ~100 KB of descriptions out of the bundle, and invents no
binary format. The cost — a committed generated file — is accepted explicitly.

**Generated-file format: `.ts`, not `.json`** (spec decision). A `.ts` module
carries a top-of-file GENERATED banner comment (JSON cannot hold comments — the
"do not edit" signal would degrade to a hacky `"_generated"` data field), exports
a typed `readonly` array so `tsc` validates the shape on every typecheck, and
imports as ordinary code with no Vite JSON-import config. It lives beside its only
consumer (`sceneStars.ts`) and the maker in `src/data/bodies/`:

```ts
// src/data/bodies/famousStars.generated.ts
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-famous-stars
// Source of truth:  data/seeds/famous_stars.seed.json
import type { FamousStarRow } from '../../@types/data/FamousStarRow';
export const FAMOUS_STARS_GENERATED: readonly FamousStarRow[] = [ /* … */ ];
```

The compact row is the render + search projection of the seed — enough to build a
`StarBody` and to search by name, and nothing else (physical prose/properties stay
in the sidecar):

```ts
// src/@types/data/FamousStarRow.d.ts   (one type per file — CLAUDE.md)
export type FamousStarRow = {
  readonly id: string;
  readonly commonName: string;      // → StarBody.label
  readonly names: readonly string[]; // palette aliases (Bayer, catalogue names)
  readonly constellation: string;    // palette secondary chip
  readonly raDeg: number;            // → positionMpc via the star maker
  readonly decDeg: number;
  readonly distancePc: number;
  readonly absMag: number;
  readonly temperatureK: number;     // → color via temperatureToLinearRgb
  readonly radiusSolar: number;      // → radiusKm
  readonly oblateness?: number;      // → StarBody.oblateness (per-axis MVP scale)
};
```

Colour is **not** baked into the generated table: the table carries `temperatureK`
and the maker converts at runtime via the new `src/utils/color/` util (§6), so the
same blackbody utility can tint Gaia stars from their `teff_gspphot` later. The
table is the source values; conversions live at one site.

**Workflow (state this in every touching plan task).** The seed and its generated
table are committed together, always in sync:

```
edit data/seeds/famous_stars.seed.json
  → npm run build-famous-stars
  → git add data/seeds/famous_stars.seed.json src/data/bodies/famousStars.generated.ts
  → commit both in the same change
```

The generated table is committed so typecheck / CI / a fresh dev clone need **no**
build step. `famous_stars_meta.json` is gitignored (build artefact, like the
`.bin` files) and reaches production only through the R2 sync (§9).

**Registry.** One new row in
[`tools/utils/io/rawDataRegistry.ts`](../../../tools/utils/io/rawDataRegistry.ts)
beside `'famous.seed'` (`:143-149`): key `'famous-stars.seed'`,
`source: 'committed'`, description + no upstream/fetcher (hand-authored). The
`.gitignore` already re-includes `data/seeds/*.json` (addendum verified) — plain
`git add`, no gitignore edit.

**Build tool.** `tools/famous/buildFamousStars.ts` modelled on `buildFamous.ts`
(entry-point guard at `:223-228`), reading the seed via `rawDataPath('famous-stars.seed')`,
writing the generated `.ts` with its banner and the sidecar via
`tools/curation/writeMetaSidecar.ts` (this is its third caller after
`buildFamous`/`buildStructures`; `MetaSidecarEntry`'s index signature carries the
extra physical fields — §7). `package.json`:
`"build-famous-stars": "tsx tools/famous/buildFamousStars.ts"`.

---

## 4. Seed parser & validation

New `tools/parsers/famousStarsSeed.ts`, modelled on
[`tools/parsers/famousSeed.ts`](../../../tools/parsers/famousSeed.ts) — hand-rolled
fail-loud validation, no zod (house convention). Public surface:

```ts
export type FamousStarEntry = { /* §2 */ };
export function validateFamousStarEntry(e: FamousStarEntry): FamousStarEntry;
export function parseFamousStarsSeed(rawJson: string): FamousStarEntry[];
```

Validation rules the parser enforces (each throws naming the offending `id`):

- `id` non-empty string; **duplicate `id` is a hard error** (it keys the generated
  row, the meta lookup, and the Gaia-dedup fact — a duplicate silently overwrites).
- `names` non-empty and `names[0] === commonName`. **`names[1]` is NOT required**
  — many nearest stars have no Bayer designation; when present it is the Bayer
  name by convention, but the validator never enforces its existence.
- `ra ∈ [0, 360)`, `dec ∈ [-90, 90]`, `distancePc >= 0` (the Sun is 0).
- `magV`, `absMag`, `radiusSolar`, `temperatureK` required, finite, and in sane
  physical ranges (e.g. `temperatureK ∈ (1000, 60000)`).
- `massSolar`, `luminositySolar`, `ageGyr` are OPTIONAL — when present, finite and
  in sane physical ranges; when absent, accepted (genuinely unknown).
- `oblateness`, when present, finite in `(0, 0.5)`.
- **`gaiaDr3` is a REQUIRED property** whose value is `string` (digits) or `null`.
  A *missing* field throws (the Q8 invariant: "not yet resolved" must not read as
  "nothing to subtract"). A present `string` must be all-digits.
- The **coverage invariant** that lived in `famousStarGaiaIds.test.ts` moves here:
  every entry carries `gaiaDr3`; the Sun's is `null`. (The deleted table's test is
  replaced by parser tests — §10.)

---

## 5. Runtime rendering changes

`sceneStars.ts` becomes a derived view: it maps the generated table through the
star maker.

```ts
// src/data/bodies/sceneStars.ts  (after)
import { star } from './makers/star';
import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
export const SCENE_STARS: readonly StarBody[] = FAMOUS_STARS_GENERATED.map(star);
```

`SCENE_BODIES` composition (`sceneBodies.ts:15`,
`SCENE_EARTH + SCENE_STARS + SCENE_PLANETS`) is unchanged; every consumer of
`SCENE_STARS` (labels, LOD split, sphere/point layers, engine data) is untouched
by name (grill Q1).

**Maker.** `makers/star.ts` changes from a positional column-signature to
`star(row: FamousStarRow): StarBody` — the "positional signature is deliberate,
the table is a dense grid of columns" rationale in its module header retires,
because the table is now *generated*, not hand-authored, so per-row legibility is
no longer the maker's job. The maker computes:

- `positionMpc` = `raDecDistToCartesian(raDeg, decDeg, distancePc · PC_TO_MPC)`
  (unchanged frame contract — the same right-handed equatorial J2000 conversion
  the galaxy pipeline uses).
- `color` = `temperatureToLinearRgb(temperatureK)` (§6) — replacing the four
  spectral-bucket palette constants.
- `radiusKm` = `radiusSolar · SOLAR_RADIUS_KM` — retiring the hardcoded 1 R☉
  placeholder (`makers/star.ts:25`, "until a later LOD promotion" — **this feature
  is that promotion**).
- `oblateness` = `row.oblateness` (passthrough; absent ⇒ omitted).

**`StarBody` field delta** (`src/@types/scene/StarBody.d.ts:23-30`, spec decision):
add exactly one field, `oblateness?: number` — the render body stays render-only
(search/prose live in the generated table + sidecar, not here). `color` and
`radiusKm` keep their shapes; only their *provenance* changes (blackbody util,
real radius). The module header updates to note colour now comes from blackbody
temperature and radius is the real per-star value.

**Colour (§6 util) — palette deletion.** The four star buckets
`A_F_WHITE / G_YELLOW_WHITE / K_ORANGE / M_RED` (`palette.ts:49-52`) are consumed
**only** by `sceneStars.ts`; delete them and their block comment. Planet tints in
`palette.ts` are a disjoint constant family consumed by `orbitalElements.ts` —
untouched (addendum 6).

**Oblateness render (addendum 4).** `starSpheresLayer.ts:106-114` composes
`composeBodyMvp(vp, positionMpc, RENDER_ORIGIN_MPC, radiusKm·KM_TO_MPC)` then
`renderer.draw(pass, mvp, star.color)`. Oblateness is a **per-axis scale variant
of the CPU-side MVP composition** — the equatorial axes scale by `radiusKm`, the
polar axis by `radiusKm·(1 - oblateness)`. No uniform or shader change; the
`starRenderer.ts` uniform (mat4 + tint) is unchanged. Achernar actually looks
flattened. Spherical stars (no `oblateness`) take the existing uniform-scale path.

**LOD (addendum 6).** `partitionStarsByResolution.ts:79` already feeds `radiusKm`
into `apparentSizePx → resolvesToSphere` (4 px threshold). Real per-star radii
therefore change each star's sphere-promotion distance **by design** — Betelgeuse
(~760 R☉) resolves to a sphere from much farther than Sirius (~1.7 R☉). The
maker's placeholder comment anticipated exactly this. No code change to the split.

**Point renderer.** `starPointRenderer.ts`'s 28-byte stride
(pos3 + color3 + absMag), `setStars` at `:171-207`, is untouched — the new seed
fields never reach it.

**Captions (grill Q10, Option A).** `sceneBodyLabels.ts:105-107,115-144,156`
derives captions from `SCENE_STARS` automatically; all ~120 ship on, existing
gates unchanged. The visual pass may add a one-line `magV` threshold follow-up
(the seed carries `magV` either way) — **not** designed here, to avoid a second
gating mechanism built blind.

**Foreground gate (addendum 1 — NO code change).** `foregroundMaxDistance.ts`
derives `FOREGROUND_MAX_DISTANCE_MPC` from the farthest body. With Deneb (~800 pc)
the gate lands at ~0.26 Mpc; the pinned assertions
(`≥ farthest × 100`, `< 1 Mpc`,
`tests/services/engine/frame/foregroundMaxDistance.test.ts:30-35`) both still hold
— the derivation absorbs the new seeds automatically (its design intent). This
spec **records** the consequence: headroom to the 1 Mpc ceiling shrinks ~100× →
~4×. No rederivation, revising Q3's earlier expectation.

---

## 6. Blackbody colour utility

No blackbody utility exists anywhere (`palette.ts:47-48` says so; addendum 6
confirms). New leaf util + focused test, one symbol per file, filename = export
name (CLAUDE.md):

```ts
// src/utils/color/temperatureToLinearRgb.ts
import type { Vec3 } from '../../@types/math/Vec3';
/**
 * Blackbody surface colour: effective temperature (K) → linear RGB, in the same
 * linear space StarBody.color already uses so it composites correctly in the HDR
 * pass. Replaces sceneStars' four spectral buckets with real chromaticity.
 */
export function temperatureToLinearRgb(kelvin: number): Vec3;
```

Implementation is the implementer's (a standard blackbody-locus approximation,
e.g. a Planckian-locus polynomial fit → linear RGB). The **contract** the test
pins is directional realism, not a magic constant: a hot star (~30000 K, Rigel)
is bluer than the Sun (~5772 K, near-white); a cool star (~3000 K, a red M dwarf)
is redder than the Sun; the Sun is near-neutral. Reusable by any future
temperature-tinted layer (Gaia).

---

## 7. InfoCard, meta consumption & deep links

### Meta consumption path — decision: (b) React-side lazy fetch

The two candidates (from the exploration): (a) mirror the galaxy `famousMeta`
engine chain — a `ResolveDeps` member, an `AssetSlot`, a fetcher, an
`ASSET_WIRING` row, built at `engine.ts:518-524`, enriching `extractSelectionRow`'s
body arm; or (b) a React-side lazy fetch à la `useFamousMeta.ts`, feeding the
InfoCard directly.

**Chosen: (b).** The galaxy chain is engine-side only because
`extractGalaxyRow` runs engine-side — a galaxy's identity (which galaxy at index
N) is knowable *only* by reading the loaded cloud, so the enrichment must happen
where the cloud lives, and it bakes `deps.famousMeta` into the `GalaxyRow`. A
star's identity is just its `id`, already present React-side in the body
`SelectionRow` — so its meta lookup is a pure function of the id, doable anywhere.
The palette does **not** need the sidecar either (it searches `names[]` from the
synchronous generated table, §8). The sidecar is therefore **InfoCard-only and
purely React-side**, which makes (b) strictly fewer moving parts: it touches
neither `ResolveDeps`, the slot chain, `ASSET_WIRING`, nor `engine.ts`. The one
engine-side change is trivial and dep-free (below).

New React-side pieces, each mirroring its galaxy twin:

```ts
// src/@types/loading/FamousStarMetaEntry.d.ts   (one type per file)
export type FamousStarMetaEntry = {
  id: string;
  names: string[];
  constellation: string;
  spectralType: string;
  distancePc: number;
  magV: number;
  absMag: number;
  radiusSolar: number;      // required (render input)
  temperatureK: number;     // required (render input)
  massSolar?: number;       // optional — omitted when unknown; card drops the line
  luminositySolar?: number; // optional
  ageGyr?: number;          // optional
  oblateness?: number;
  variable?: { type: string; magRange: [number, number] };
  description: string;
};

// src/services/loading/fetchers/famousStarsMetaFetcher.ts
//   mirrors famousMetaFetcher.ts: fetch dataUrl('famous_stars_meta.json'),
//   throw HttpError on !ok, parse the array. tier-agnostic.

// src/hooks/useFamousStarsMeta.ts
//   mirrors useFamousMeta.ts: fetch once at mount, { meta, ready }, fail-soft
//   (empty + ready=true on 404 so a build without the sidecar doesn't deadlock).
```

### The `body` FocusableTarget arm (table-row growth, addendum 5)

Today `buildFocusable.ts:26`'s body arm is `() => null`; `FocusableTarget`,
`FocusableTargetType`, `DETAIL_CARD`, and `URL_HASH_FOR` all exclude `body`. Each
grows exactly one row/variant:

- **`FocusableTargetType`** (`:4`) gains `'body'`.
- **`FocusableTarget`** gains a new `StarInfo` arm
  (`src/@types/engine/StarInfo.d.ts`, one type per file):
  ```ts
  export type StarInfo = {
    readonly type: 'body';
    readonly id: string;
    readonly label: string;
    readonly positionMpc: Vec3;
    readonly radiusKm: number;
  };
  ```
  This carries only what's knowable synchronously (the physical prose comes from
  the sidecar at render time). `label` is added to the body `SelectionRow` so the
  card shows the name instantly while the description streams in — see below.
- **`SelectionRow`** body arm (`src/@types/engine/SelectionRow.d.ts:24-29`) gains
  `label` (the sidecar's arrival is async; the name should not wait on it).
  `extractSelectionRow.ts:34-43`'s body arm already reads the `SCENE_BODIES`
  entry — it adds `label: body.label`. Still no `ResolveDeps` member, still
  compile-time seed data, still self-contained + JSON-serializable.
- **`buildFocusable`** body arm returns a `StarInfo` **only when the row's `id`
  resolves in a `Set<id>` derived from `FAMOUS_STARS_GENERATED`** (a static, sync
  `import` of the generated table — `buildFocusable` stays pure, no fetch, no
  engine reach). A non-star body — Earth, the planets, the moons — is **not** in
  that set, so the arm still returns `null` for them, preserving today's behaviour
  (no InfoCard for Earth/planets; their meta sidecars are a future feature). So
  the arm is `(row) => STAR_IDS.has(row.id) ? { type:'body', id, label,
  positionMpc, radiusKm } : null`. Still pure; the memoized
  `selectFocusedFocusable`/`Hovered`/`Selected` selectors
  (`state/selection/selectors.ts:88-111`) need no change — they already pass the
  body row through `buildFocusable`. Because `URL_HASH_FOR`'s `body` row keys off
  the same focusable, a `null` focusable (non-star body) yields **no** `#focus`
  hash by construction — no separate guard needed there.
- **`DETAIL_CARD`** (`detailCardTable.ts:64-110`) gains a `body` row →
  `StarDetailCard` (Detail) / `CompactStarCard` (Compact).
- **`URL_HASH_FOR`** (`urlHashFor.ts:21-30`) gains a `body` row →
  `(t) => t.type === 'body' ? t.id : null`. The `#focus=body-<id>` codec already
  round-trips (`focusIdOf.ts` / `resolveFocusId.ts:119-122` →
  `SelectionRef{type:'body',id}`), so deep links come almost free.

### The cards

New components via the create-component skill (own folder, `.module.css`, one
component per file, `function Name(){}` + `export default`):

- **`StarDetailCard`** — given `StarInfo`, calls `useFamousStarsMeta()`, looks up
  `meta.find(m => m.id === target.id)`, and renders: headline (`label`), an "also
  known as" line from `entry.names.slice(1)` (the `GalaxyDetailCard.tsx:42-67`
  famous-names + `DescriptionBlock` idiom), a properties block (constellation,
  spectral type, distance, V/abs mag, mass, radius, temperature, luminosity, age,
  and a variability line when `variable` is present), and the curated
  `description`. Before the sidecar resolves (or on a dev clone with no sidecar),
  it shows headline + name only — the fail-soft path. Closest template for a
  fetch-light, singleton-ish card is `MilkyWayDetailCard`.
- **`CompactStarCard`** — the hover preview: headline + constellation, no fetch
  dependency required (name comes from `StarInfo.label`).

---

## 8. Search

**Ungate all bodies (addendum 3, user decision).** `rankPaletteMatches.ts:94-101`
gates the body rows behind `hasUrlGate('deepZoom')`. Remove the gate for **every**
body kind (no per-kind special case) so Earth, planets, and stars are always
searchable. The stranding rationale the gate guarded (wheel-zoom floor leaving the
camera in empty sky) is superseded — the parked foreground-body-picking work owns
that, and framing already flies to bodies.

**Star aliases from the generated table.** Star rows get their `names[]` (Bayer +
catalogue names) and `constellation` from the generated compact table, not from
`StarBody` (which stays render-only, §5). The body arm of `rankPaletteMatches`
resolves each body id against a generated-table name index:

- Build a `Map<id, { names, constellation }>` from `FAMOUS_STARS_GENERATED` (a
  small derived const beside the generated import).
- For a star body, score over its full `names[]` (so "Alpha Orionis" and
  "Betelgeuse" both hit). For Earth/planets (not in the map), fall back to
  `[body.label]` — the current behaviour.

**Palette secondary text — decision: constellation.** `paletteRows.tsx:105-118`'s
body row shows a fixed "Solar System" chip. Star rows instead show their
**constellation** as the secondary (e.g. "Betelgeuse" · "Orion") — the most
recognisable, most-searched context for a star; Bayer/other aliases render as the
`names.slice(1)` secondary line the way famous/alias rows already do. Earth and
the planets keep "Solar System". Concretely: the `ScoredRow` body variant carries
the resolved `names` + secondary label, and `ROW_VIEW.body` renders
`names[0]` primary, `names.slice(1)` + constellation-or-"Solar System" secondary
— one row-view branch, no new row *kind*.

**Search → selection is already wired** end-to-end (verified): palette pick →
`focusIdForRow.ts:52` (`body-<id>`) → `requestFocus` →
`watchRequestFocusSaga.ts:18-28` → `resolveFocusId.ts:119-122` →
`SelectionRef{type:'body',id}` → `updateSelectionFocus`. No change needed there;
removing the gate + adding aliases is the whole search delta.

---

## 9. Gaia dedup integration

`tools/stars/buildStars.ts:88` imports `FAMOUS_STAR_GAIA_IDS`, consumed at
`:604-606` into a `Set<bigint>` passed to `selectStars` (`selectStars.ts:76,100-153`
— subtraction is by `source_id` only). The seed now owns that fact (grill Q8):

- **Replace** the import with a seed parse: read `data/seeds/famous_stars.seed.json`
  via `parseFamousStarsSeed`, map each entry's `gaiaDr3` through `BigInt(…)`,
  **dropping `null`s**, into the `ReadonlySet<bigint>` `selectStars` already wants.
- **Delete** `tools/catalog/famousStarGaiaIds.ts` and
  `tests/tools/catalog/famousStarGaiaIds.test.ts` (delete-proxy-surfaces rule).
  The coverage invariant (every entry has the field; the Sun is `null`) moves into
  the seed-parser tests (§4, §10).

**Timing (grill Q8, Q11 item 5).** The subtraction list grows 26 → ~120, so the
seed — and specifically every entry's resolved `gaiaDr3` — must land **before the
first real `build-stars` run**, so the Gaia bin's dedup is complete on its first
build (no rebuild). The Gaia fetch is still in flight, so the window is ideal.

---

## 10. Test plan deltas

Per [`docs/superpowers/conventions/testing.md`](../../conventions/testing.md) —
each test must be able to fail on a real bug no compiler/other test catches. No
constant restatement, no clamp-boundary or mirror tests.

**New tests:**

- `tools/parsers/famousStarsSeed.test.ts` — duplicate `id` throws; a **missing**
  `gaiaDr3` field throws (the required-field invariant); `gaiaDr3: null` is
  accepted; a non-digit `gaiaDr3` string throws; out-of-range `ra`/`dec`/
  `distancePc`/`temperatureK` throw; `names[0] !== commonName` throws. Includes the
  coverage invariant migrated from the deleted `famousStarGaiaIds.test.ts` (every
  entry carries `gaiaDr3`; the Sun's is `null`).
- `src/utils/color/temperatureToLinearRgb.test.ts` — directional realism (§6): hot
  bluer than Sun, cool redder than Sun, Sun near-neutral. Asserts channel
  *relationships*, not literal RGB constants.
- `buildFamousStars` — a fixture seed round-trips: the emitted generated table
  matches the render+search projection and the sidecar carries the physical
  fields + description (one golden-ish assertion over a 2–3 entry fixture, not the
  full ~120).
- `buildStars`/`selectStars` seed-derived subtraction — a fixture seed's non-null
  `gaiaDr3` id is removed from a candidate set and its `null` entry contributes
  nothing (the behaviour the deleted table's coverage test used to guard).
- `StarDetailCard` — renders headline + "also known as" + description from a
  mocked `useFamousStarsMeta`; renders headline-only before the meta resolves
  (fail-soft). `buildFocusable` body arm returns a `StarInfo` for a **star** id
  (in `FAMOUS_STARS_GENERATED`) and `null` for a **non-star** body id (Earth) —
  the star-only guard.
- Deep link — `#focus=body-<id>` resolves to the star and `URL_HASH_FOR.body`
  reproduces it (round-trip), reusing the existing focus-id codec tests' shape.
- Palette — a star is findable by its **Bayer** alias (not just its common name)
  with the `deepZoom` gate absent; a body row appears without the gate.

**Existing tests that shift (update expectations; keep the ones that catch real
bugs):**

- `tests/data/bodies/sceneStars.test.ts` — `SCENE_STARS` now derives from the
  committed generated table. The load-bearing assertions **must survive**: the
  frame-pinning RA/Dec conversion for a known star (catches a broken frame
  contract), the Proxima ~1.301 pc f64 anchor (tolerance 1e-3 pc), and Sirius/α Cen
  spot checks. The Sun's radius is now `1 R☉ × SOLAR_RADIUS_KM = 696340` **by
  derivation** (its `radiusSolar` is 1.0 in the seed) rather than by the maker's
  removed placeholder — keep the exact-radius assertion; it now proves the
  `radiusSolar → radiusKm` path. Colour spot-checks switch from palette-bucket
  equality to a blackbody directional check (or drop to the util's own test).
- `createEngineData.test.ts` (`toEqual(SCENE_STARS)`) — passes through unchanged
  in intent; the value it compares against simply grows.
- `sceneBodyLabels.test.ts` — the label-count formula tracks the new
  `SCENE_STARS.length`; update the count. (A pure length mirror; updates
  mechanically — flagged, not defended as a bug-catcher.)
- `initGpu.destroyReachability.test.ts:259,404` — `SCENE_STARS.length` references
  update mechanically for the same reason.

---

## 11. Curation plan

Sequenced **after** the pipeline lands (grill Q11 item 4), so the validator (§4)
catches schema drift per batch — the seed is authored against a working build, not
in the dark.

- **Batches of ~15–20 stars**, each a plan task: a subagent authors that batch's
  entries, runs `npm run build-famous-stars` (validation gates the batch), commits
  seed + regenerated table together.
- **Descriptions** (grill Q7, Option B): curated prose, 3–5 sentences — what it
  is, etymology, companions, the one famous fact — **fact-checked** against
  Wikipedia/SIMBAD while authoring, not copied verbatim.
- **`gaiaDr3` resolution via SIMBAD identifier lists, NEVER positional matching**
  (grill Q11 item 4) — high-proper-motion stars break positional cross-match; the
  existing table's rule. Saturated bright stars with no DR3 row resolve to `null`
  (SIMBAD-confirmed), with a `gaiaDr3Note` when the choice of component is
  non-obvious.
- **Selection** = brightest-table ∪ existing 26 ∪ ~10 iconic extras (§1); the
  extras list is finalised at authoring time, kept short.

---

## 12. Ground preparation

**None needed — ground verified ready by the 2026-07-17 refactor-ground pass.**

The three-explorer ideal-diff pass (transcript addendum, "Refactor-ground
checkpoint addendum") returned **"ground is ready — every touchpoint lands as
growth; no prep refactors needed."** Each seam the feature needs already exists as
a keyed table or a derivation that absorbs new data:

- `sceneStars.ts` → seed derivation: a one-line `.map(star)` over the generated
  table; `SCENE_STARS` keeps its name, all consumers untouched (growth).
- `FOREGROUND_MAX_DISTANCE_MPC`: **no** change — the derivation absorbs Deneb and
  the pinned assertions still hold (addendum 1, revising Q3).
- palette → blackbody colour: the four star buckets are a disjoint deletable
  constant family; the new util is a green-field leaf (addendum 6).
- `famousStarGaiaIds.ts` deletion: `buildStars` needs only a seed-derived
  `ReadonlySet<bigint>`; the coverage invariant moves into the parser tests
  (addendum 6, §9).
- Search / InfoCard / deep links: `FocusableTargetType`, `FocusableTarget`,
  `DETAIL_CARD`, `URL_HASH_FOR`, `ROW_VIEW`, `rankPaletteMatches` are all keyed
  tables or pure dispatch — one row/arm each (addendum 3, 5); the `#body-<id>`
  codec already round-trips.

Per grill Q11 item 6 (user decision), any refactor this feature entails lands on
this one branch (`famous-stars-seed-pipeline`) regardless — there are no separate
prep or docs PRs. No backlog item to sweep (grill Q11 item 7, checked).

---

## References

- Grill ledger: [`docs/grill-sessions/famous-stars-2026-07-17.md`](../../grill-sessions/famous-stars-2026-07-17.md)
- Sibling in-flight spec (Gaia star bin; the dedup counterpart):
  [`docs/superpowers/specs/2026-07-13-gaia-star-bin-design.md`](2026-07-13-gaia-star-bin-design.md)
- Seed/pipeline precedent: [`tools/parsers/famousSeed.ts`](../../../tools/parsers/famousSeed.ts),
  [`tools/famous/buildFamous.ts`](../../../tools/famous/buildFamous.ts),
  [`tools/curation/writeMetaSidecar.ts`](../../../tools/curation/writeMetaSidecar.ts)
- Body/InfoCard seams: [`src/services/engine/helpers/buildFocusable.ts`](../../../src/services/engine/helpers/buildFocusable.ts),
  [`src/components/InfoCard/detailCardTable.ts`](../../../src/components/InfoCard/detailCardTable.ts),
  [`src/hooks/urlHashFor.ts`](../../../src/hooks/urlHashFor.ts)
