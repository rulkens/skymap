# Famous Stars — Plan 01: Seed pipeline + runtime

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per task + spec review + quality review). Each
> task is TDD: failing test first, minimal green, commit. Dispatch implementers with
> `run_in_background: true`; the **main thread** runs `npm test` / `npm run typecheck`
> and makes the commits (background subagents cannot run npm — they MAY self-run
> `npx tsc --noEmit` as a pre-flight only).
>
> **Plan style (OVERRIDES upstream `writing-plans`):**
> [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) —
> **contract code yes, implementation code NO.** Type signatures, byte/field layouts,
> and test names ARE contract (reproduced here); function bodies are not — cite
> `path:line` and let the implementer write the body from the test.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> Hand-computed / round-trip / independent-property assertions only. No constant
> restatements, no clamp-boundary or mirror tests, no runtime tests of type
> declarations (tsc proves those).

**Spec:** [`docs/superpowers/specs/2026-07-17-famous-stars.md`](../specs/2026-07-17-famous-stars.md)
— this plan owns §2–§9 (seed schema, pipeline artefacts, parser+validation, runtime
rendering, blackbody colour, InfoCard/meta/deep-links, search, Gaia dedup) plus the §10
test deltas and the §9 R2 sync row. Plan 02 owns the actual **curation** (§11): batch
authoring of the full ~120-star roster.

**Grill ledger (decisions — cite, do not re-litigate):**
[`docs/grill-sessions/famous-stars-2026-07-17.md`](../../grill-sessions/famous-stars-2026-07-17.md).

## Four spec corrections baked into this plan (already applied to the spec)

These override any older phrasing you might read elsewhere in the spec; they are the
authority:

1. **`buildFocusable` body arm is star-only.** It returns `StarInfo` **only when the
   row id resolves in a set derived from `FAMOUS_STARS_GENERATED`** (a static sync
   import — `buildFocusable` stays pure). Non-star bodies (Earth, planets, moons) keep
   returning `null` — no InfoCard, no `#focus` hash — preserving today's behaviour. The
   URL-hash absence follows by construction (null focusable → no hash).
2. **`distancePc >= 0`, not `> 0`** — the Sun's entry is `distancePc: 0` (heliocentric
   origin; the maker collapses it to `[0,0,0]`).
3. **`names[1]` is NOT required to be a Bayer designation.** Many nearest stars
   (Barnard's Star, Ross 154, Luyten 726-8, Wolf 359) have none. Enforce only: `names`
   non-empty and `names[0] === commonName`. `names[1]` is Bayer *by convention* when one
   exists.
4. **Schema optionality follows the omit-unknown rule.** `massSolar?`,
   `luminositySolar?`, `ageGyr?` are OPTIONAL (genuinely unknown for some entries —
   never a guessed 0). `radiusSolar` and `temperatureK` stay REQUIRED (render inputs,
   always estimable). The InfoCard omits absent property lines.

## Goal

Turn one committed seed — `data/seeds/famous_stars.seed.json` — into the single source
of truth for every named star skymap draws. A build tool validates it and emits (1) a
committed generated compact table `src/data/bodies/famousStars.generated.ts` that
`sceneStars.ts` imports synchronously, and (2) a gitignored
`public/data/famous_stars_meta.json` sidecar for the InfoCard. The stars render through
the existing scene-body path with **real** physical parameters (per-star radius,
blackbody surface colour, optional oblateness), become searchable by name, and read in a
real star InfoCard. This plan lands the pipeline + runtime + **the initial 26-star seed**
(curation batch 0, required for a green suite); plan 02 grows the roster to ~120.

```
data/seeds/famous_stars.seed.json  ─build-famous-stars─▶  famousStars.generated.ts (committed)
                                                     └──▶  public/data/famous_stars_meta.json (gitignored → R2)
        │                                                          │
        ▼                                                          ▼
  parseFamousStarsSeed ──▶ Gaia dedup set (buildStars)      React fetch (useFamousStarsMeta) ──▶ InfoCard
        │
        ▼
  FAMOUS_STARS_GENERATED.map(star) = SCENE_STARS ──▶ points / labels / spheres / search / focus
```

## Global constraints (house rules — override defaults)

- **`type` aliases, never `interface`.** **One `type` per file in `src/@types/`**
  (filename = the exported type). **One exported function per file in `src/utils/` and
  `tools/utils/`** (filename = the symbol). `src/data/` and `tools/` build modules may
  carry several related exports. Deep relative imports, no barrels.
- **`Vec3` alias**, never a raw `[number, number, number]` tuple
  (`src/@types/math/Vec3.d.ts`).
- **Raw paths via the registry** — `rawDataPath('famous-stars.seed')`, never a literal
  `data/raw/...` or `data/seeds/...`.
- **Committed-together workflow (state it in every touching task):** the seed and its
  generated table are one commit — `edit seed → npm run build-famous-stars →
  git add data/seeds/famous_stars.seed.json src/data/bodies/famousStars.generated.ts →
  commit both`. The generated file carries a top-of-file GENERATED banner; never
  hand-edited. `famous_stars_meta.json` is gitignored (build artefact).
- **Didactic timeless comments** — explain *why* / *what the alternative was*; no dates
  or PR refs. Match the multi-paragraph module-header style of the files you touch.
- **Subagent implementers run bash sequentially**, cannot use `sed`/`awk`/`grep` (use
  Read/Grep tools), cannot run npm — the main thread verifies + commits.
- **Suite stays green** at every task; the **final task gates on `npm run typecheck`
  (both tsconfigs) + `npm test` + `npm run format` on touched files only**.

## Interfaces (LOCKED — reuse these names/signatures verbatim across tasks)

```ts
// src/@types/data/FamousStarRow.d.ts        (one type per file)
export type FamousStarRow = {
  readonly id: string;
  readonly commonName: string;        // → StarBody.label
  readonly names: readonly string[];  // palette aliases (Bayer, catalogue names)
  readonly constellation: string;     // palette secondary chip
  readonly raDeg: number;             // → positionMpc via the star maker
  readonly decDeg: number;
  readonly distancePc: number;
  readonly absMag: number;
  readonly temperatureK: number;      // → color via temperatureToLinearRgb
  readonly radiusSolar: number;       // → radiusKm
  readonly oblateness?: number;       // → StarBody.oblateness (per-axis MVP scale)
};

// src/@types/engine/StarInfo.d.ts           (one type per file)
export type StarInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly radiusKm: number;
};

// src/@types/loading/FamousStarMetaEntry.d.ts   (one type per file) — sidecar record
export type FamousStarMetaEntry = {
  id: string;
  names: string[];
  constellation: string;
  spectralType: string;
  distancePc: number;
  magV: number;
  absMag: number;
  radiusSolar: number;      // required
  temperatureK: number;     // required
  massSolar?: number;       // optional — card omits the line when absent
  luminositySolar?: number; // optional
  ageGyr?: number;          // optional
  oblateness?: number;
  variable?: { type: string; magRange: [number, number] };
  description: string;
};

// tools/parsers/famousStarsSeed.ts           (the authoring shape — co-located, tool-local)
export type FamousStarEntry = { /* spec §2, corrections 2–4 applied */ };
export function validateFamousStarEntry(e: FamousStarEntry): FamousStarEntry;
export function parseFamousStarsSeed(rawJson: string): FamousStarEntry[];

// src/utils/color/temperatureToLinearRgb.ts  (one symbol per file)
export function temperatureToLinearRgb(kelvin: number): Vec3;
```

---

## Task 1 — `@types` declarations

**Files (new, one type per file):** `src/@types/data/FamousStarRow.d.ts`,
`src/@types/engine/StarInfo.d.ts`, `src/@types/loading/FamousStarMetaEntry.d.ts`.
**Modify:** `src/@types/scene/StarBody.d.ts` (add `oblateness?`).

**Rule (put in the task text for the implementer):** every file in `src/@types/` exports
**exactly one** `type`; filename = the type name. Deep relative imports, no barrel.

- [x] Add `FamousStarRow.d.ts`, `StarInfo.d.ts`, `FamousStarMetaEntry.d.ts` verbatim from
      the Interfaces section, each with a didactic docblock (what it projects and why the
      shape is exactly this — render+search for the row, sync-knowable fields for
      `StarInfo`, sidecar physical properties for the meta entry).
- [x] Add `readonly oblateness?: number;` to `StarBody` (`StarBody.d.ts:23-30`) with a
      one-line comment (flattening `(a−c)/a`, absent ⇒ spherical; feeds the per-axis MVP
      scale). Update the module header's "colour is the spectral-class palette" note to
      "colour derives from blackbody `temperatureK`; radius is the real per-star value".
- [x] **No runtime test** — `tsc` proves these (testing.md: no runtime tests of type
      declarations). Downstream tasks consume them. Commit.

## Task 2 — `temperatureToLinearRgb` blackbody util

**Files:** `src/utils/color/temperatureToLinearRgb.ts` (new, one symbol),
`tests/utils/color/temperatureToLinearRgb.test.ts` (new).

**Signature:** `temperatureToLinearRgb(kelvin: number): Vec3` — effective temperature →
linear RGB, in the same linear space `StarBody.color` uses (composites in the HDR pass).
Implementation is the implementer's (a standard Planckian-locus polynomial fit → linear
RGB). Reusable later for Gaia `teff_gspphot` tinting — that's why it's a leaf util, not
inlined in the maker (spec §6).

- [x] Add `temperatureToLinearRgb.ts` with a didactic docblock (blackbody locus; why
      linear RGB; the future Gaia reuse).
- [x] Test `hotter stars are bluer than the Sun` — `temperatureToLinearRgb(30000)` (Rigel)
      has a higher blue:red channel ratio than `temperatureToLinearRgb(5772)` (Sun).
- [x] Test `cooler stars are redder than the Sun` — `temperatureToLinearRgb(3000)`
      (M dwarf) has a higher red:blue ratio than the Sun.
- [x] Test `the Sun is near-neutral` — at 5772 K the three channels sit within a modest
      band of each other (no channel dominates). **Assert channel *relationships*, never
      literal RGB constants** (spec §6 pins directional realism, not magic numbers).
- [x] `npm test -- temperatureToLinearRgb` → green. Commit.

## Task 3 — Seed parser + validation

**Files:** `tools/parsers/famousStarsSeed.ts` (new), `tests/tools/parsers/famousStarsSeed.test.ts` (new).
Modelled on `tools/parsers/famousSeed.ts` — hand-rolled fail-loud validation, no zod.

**`FamousStarEntry`** is the spec §2 shape with corrections 2–4 applied (co-located in
the parser file like `FamousEntry` in `famousSeed.ts:27-95`). **Validation rules** (each
throws naming the offending `id`, mirroring `validateFamousEntry`, `famousSeed.ts:103-166`):

- `id` non-empty string; **duplicate `id` across the array is a hard error**
  (`parseFamousStarsSeed`, mirror `famousSeed.ts:172-189`).
- `names` non-empty **and `names[0] === commonName`**. **Do NOT require `names[1]`**
  (correction 3).
- `ra ∈ [0, 360)`, `dec ∈ [-90, 90]`, **`distancePc >= 0`** (correction 2 — the Sun is 0).
- `magV`, `absMag`, `radiusSolar`, `temperatureK` required, finite, sane physical ranges
  (`temperatureK ∈ (1000, 60000)`). `massSolar`, `luminositySolar`, `ageGyr` OPTIONAL —
  validated only when present (correction 4).
- `oblateness`, when present, finite in `(0, 0.5)`.
- **`gaiaDr3` is a REQUIRED property** whose value is `string` (all-digits) or `null`. A
  **missing** field throws (the Q8 invariant: "not yet resolved" must not read as
  "nothing to subtract"). A present string must be all-digits.

**Tests (spec §10 — each fails on a real bug):**

- [x] `throws on a duplicate id`.
- [x] `throws on a missing gaiaDr3 field` — an entry object with no `gaiaDr3` key at all
      throws (the required-field invariant — hand-build the object without the key).
- [x] `accepts gaiaDr3: null` — a `null` entry validates.
- [x] `throws on a non-digit gaiaDr3 string` — e.g. `"DR3 123"` or `"12a3"` throws.
- [x] `throws on out-of-range ra / dec / distancePc / temperatureK` — one case each
      (`distancePc: -1` throws; `distancePc: 0` is ACCEPTED — the Sun).
- [x] `throws when names[0] !== commonName`.
- [x] `accepts an entry with no names[1]` — a single-name entry (`names: ['Barnard's
      Star']`, `commonName` equal) validates (correction 3 regression guard).
- [x] `accepts an entry omitting massSolar/luminositySolar/ageGyr` (correction 4).
- [x] **Coverage invariant (migrated from the deleted `famousStarGaiaIds.test.ts`):**
      `every parsed entry carries gaiaDr3, and the Sun's is null` — parse the *real*
      committed seed (once it lands in Task 5) via `rawDataPath('famous-stars.seed')`,
      assert every entry has the property and `entries.find(e => e.id === 'sun').gaiaDr3
      === null`. (Structural invariant over curated data — a keep-rule test.)
- [x] `npm test -- famousStarsSeed` → green. Commit.

> **Ordering note:** the coverage-invariant test reads the real seed, which Task 5
> authors. Write it now against a tiny inline fixture for the field-present check, and add
> the real-seed assertion in Task 5's commit (or gate it so it skips until the file
> exists). The other rule tests use hand-built fixtures and pass immediately.

## Task 4 — `buildFamousStars` build tool + registry + script

**Files:** `tools/famous/buildFamousStars.ts` (new), `tools/utils/io/rawDataRegistry.ts`
(modify — add one row), `package.json` (modify — add the script),
`tests/tools/famous/buildFamousStars.test.ts` (new). Modelled on
`tools/famous/buildFamous.ts` (entry-point guard `buildFamous.ts:222-228`; sidecar write
`buildFamous.ts:204-213`).

**Registry row** beside `'famous.seed'` (`rawDataRegistry.ts:143-149`): key
`'famous-stars.seed'`, `path: 'data/seeds/famous_stars.seed.json'`, `kind: 'file'`,
`source: 'committed'`, one-line description, **no** `upstream`/`fetcher` (hand-authored).
The `.gitignore` already re-includes `data/seeds/*.json` — plain `git add`, no gitignore
edit (spec §3).

**`package.json`:** `"build-famous-stars": "tsx tools/famous/buildFamousStars.ts"`.

**Behaviour:** read the seed via `rawDataPath('famous-stars.seed')` → `parseFamousStarsSeed`
(Task 3) → emit **two** artefacts:

1. `src/data/bodies/famousStars.generated.ts` — a `.ts` module with the top-of-file
   GENERATED banner (spec §3 sample), importing `type { FamousStarRow }` and exporting
   `export const FAMOUS_STARS_GENERATED: readonly FamousStarRow[] = [ … ]`. Each row is
   the render+search projection of a seed entry (`id`, `commonName`, `names`,
   `constellation`, `raDeg`←`ra`, `decDeg`←`dec`, `distancePc`, `absMag`, `temperatureK`,
   `radiusSolar`, `oblateness?`). Nothing else (prose/physical properties stay in the
   sidecar).
2. `public/data/famous_stars_meta.json` — via `writeMetaSidecar`
   (`tools/curation/writeMetaSidecar.ts:35` — this is its **third** caller after
   `buildFamous`/`buildStructures`). Each entry is a `FamousStarMetaEntry` (the physical
   fields + `description` ride through `MetaSidecarEntry`'s index signature,
   `writeMetaSidecar.ts:23-29`). Guard the CLI entry with the
   `process.argv[1] === fileURLToPath(import.meta.url)` idiom so the test can import
   without running it (`buildFamous.ts:222-228`).

**Test (spec §10 — fixture round-trip, not the full roster):**

- [x] Add `buildFamousStars.ts` with a didactic module header (why split-at-build; why a
      committed generated `.ts`; the two artefacts). Extract the seed→row projection and
      the seed→meta projection as pure functions the test can call directly (keep the file
      thin so the test needn't touch the filesystem).
- [x] Add the `'famous-stars.seed'` registry row and the `package.json` script.
- [x] Test `projects a fixture seed into the generated table` — feed a 2–3-entry fixture
      (one spherical, one with `oblateness` + `variable`, one with a `null` gaiaDr3 +
      omitted `massSolar`); assert the generated rows carry exactly the render+search
      fields (id/commonName/names/constellation/raDeg/decDeg/distancePc/absMag/
      temperatureK/radiusSolar/oblateness?) and **omit** description/spectralType/magV.
- [x] Test `projects a fixture seed into the sidecar` — assert the sidecar entries carry
      the physical fields + `description`, that an omitted optional (`massSolar`) is
      **absent** (not `0`/`null`) in the JSON, and that `variable` round-trips.
- [x] `npm test -- buildFamousStars` → green. Commit (tool + registry + script; no
      generated artefact yet — that lands in Task 5).

## Task 5 — Initial seed (curation batch 0): the existing 26 stars, fully curated

**Files:** `data/seeds/famous_stars.seed.json` (new — the 26 entries),
`src/data/bodies/famousStars.generated.ts` (generated — do NOT hand-write; produced by
the build). This task is **required for a green suite** because Task 6 makes `SCENE_STARS`
derive from the generated table.

**Roster = exactly the 26 current `SCENE_STARS`** (`sceneStars.ts:41-65`). For each:

- **`id`, `commonName`, `raDeg`, `decDeg`, `distancePc`, `absMag`** — migrate **verbatim**
  from `sceneStars.ts`. **The RA/Dec and distances MUST keep the exact current
  `sceneStars.ts` values** so the frame-pinning + Proxima f64-anchor + Sirius/α Cen
  spot-check tests stay green (`sceneStars.test.ts:25-80`). State this loudly to the
  implementer: **do not "improve" these numbers** — the tests pin them.
- **`gaiaDr3`** (+ `gaiaDr3Note` where the component choice is non-obvious) — migrate from
  `tools/catalog/famousStarGaiaIds.ts:40-91` (the per-row SIMBAD provenance comments there
  become `gaiaDr3Note`s / the seed's per-entry notes). The Sun and the bright-star-hole
  stars (α Cen, Sirius, Procyon, Altair, Vega, Fomalhaut, Pollux) are `null`. This
  migration MUST happen **before** `famousStarGaiaIds.ts` is deleted in Task 8.
- **`names`** — `names[0] === commonName`; add the Bayer name as `names[1]` **only where
  one exists** (Sirius → "Alpha Canis Majoris", Vega → "Alpha Lyrae", etc.), plus common
  catalogue names. Barnard's Star / Ross 154 / Wolf 359 / Luyten 726-8 legitimately have
  just the one name (correction 3).
- **`constellation`, `spectralType`, `magV`, `radiusSolar`, `temperatureK`,
  `description`** (and `massSolar?`/`luminositySolar?`/`ageGyr?`/`oblateness?`/`variable?`
  where real) — **author + fact-check via WebSearch/WebFetch against Wikipedia/SIMBAD**
  (grill Q7 Option B; 3–5 sentence descriptions). **Omit** any optional field that is
  genuinely unknown — never write 0 or a guess (correction 4). None of these 26 are
  oblate — leave `oblateness` absent.

**Then (MAIN THREAD):** run `npm run build-famous-stars` to emit the generated table +
sidecar; verify the validator passes; **commit the seed + generated table together** (the
sidecar is gitignored). Add/enable the real-seed coverage-invariant assertion from Task 3.

- [x] Author all 26 (=25) seed entries per the migration + fact-check rules above.
- [x] (main thread) `npm run build-famous-stars` → validator green; `famousStars.generated.ts`
      emitted with the 26 rows.
- [x] Enable the Task 3 real-seed coverage test (every entry has `gaiaDr3`; the Sun is
      `null`).
- [x] `git add data/seeds/famous_stars.seed.json src/data/bodies/famousStars.generated.ts`
      and commit both.

## Task 6 — `SCENE_STARS` derivation + `star` maker + palette deletion

**Files:** `src/data/bodies/sceneStars.ts` (rewrite to a derivation),
`src/data/bodies/makers/star.ts` (new signature), `src/data/bodies/palette.ts` (delete
the four star buckets), `tests/data/bodies/sceneStars.test.ts` (update expectations).

**`sceneStars.ts` (after):** `export const SCENE_STARS: readonly StarBody[] =
FAMOUS_STARS_GENERATED.map(star);` (spec §5). `SCENE_BODIES` composition
(`sceneBodies.ts:15`) is unchanged; every `SCENE_STARS` consumer is untouched by name.

**`makers/star.ts` — new signature `star(row: FamousStarRow): StarBody`** (spec §5). The
"positional signature is deliberate" rationale in its header (`star.ts:1-14`) retires — the
table is now *generated*, so per-row legibility is no longer the maker's job. It computes:

- `positionMpc = raDecDistToCartesian(row.raDeg, row.decDeg, row.distancePc *
  SCALE_UNITS.PC_TO_MPC)` (unchanged frame contract, `star.ts:39`).
- `color = temperatureToLinearRgb(row.temperatureK)` (Task 2) — replacing the four
  spectral-bucket palette constants.
- `radiusKm = row.radiusSolar * SOLAR_RADIUS_KM` — retiring the hardcoded 1 R☉
  placeholder (`star.ts:21-25,42`). `SOLAR_RADIUS_KM = 696340` stays module-local.
- `oblateness = row.oblateness` (passthrough; absent ⇒ omitted).

**`palette.ts`:** delete `A_F_WHITE / G_YELLOW_WHITE / K_ORANGE / M_RED` and their block
comment (`palette.ts:41-52`) — consumed **only** by `sceneStars.ts`. Planet/satellite
tints are a disjoint family (`orbitalElements.ts` consumers) — untouched (spec §5,
addendum 6).

**`sceneStars.test.ts` — the load-bearing assertions MUST survive** (spec §10); update
only what the derivation shifts:

- [x] Rewrite `sceneStars.ts` as the `.map(star)` derivation; update its module header
      (derived from the generated seed table, not hand-authored).
- [x] Change `makers/star.ts` to `star(row: FamousStarRow): StarBody`; update the header
      (colour now blackbody, radius now real per-star).
- [x] Delete the four star-bucket constants + comment from `palette.ts`.
- [x] Keep `contains the Sun at the origin` — but the Sun's radius is now `1 R☉ ×
      SOLAR_RADIUS_KM = 696340` **by derivation** (seed `radiusSolar: 1.0`); keep the
      exact-radius assertion — it now proves the `radiusSolar → radiusKm` path
      (`sceneStars.test.ts:22`).
- [x] Keep `Proxima sits ~1.301 pc` (the f64 anchor, tol 1e-3 pc,
      `sceneStars.test.ts:25-32`), `named stars sit at their catalogued distances`
      (Sirius/α Cen, `:48-58`), and `star direction matches its RA/Dec` (frame pin,
      `:60-80`) — all unchanged (the seed carried the exact `sceneStars.ts` values, Task 5).
- [x] Update `the local map covers the neighbourhood` (`:34-46`): the colour check was a
      palette-bucket `[0,1]`-range assertion — either keep the finite/range check (colours
      now come from the blackbody util) or drop the colour clause to the util's own test
      (Task 2). Keep the `>= 20` length lower-bound.
- [x] `npm test -- sceneStars` → green. Commit. (Seed + generated already committed in
      Task 5; this is the derivation switch only.)

> **Also update the mechanical `SCENE_STARS.length` mirrors** that the derivation shifts
> (spec §10): `sceneBodyLabels.test.ts` label-count formula and
> `initGpu.destroyReachability.test.ts:259,404`. These are pure length mirrors — update
> the counts mechanically; flag them, do not defend them as bug-catchers. Fold into this
> task's commit (they track `SCENE_STARS.length`, which is stable at 26 through this plan).

## Task 7 — Oblateness render (per-axis MVP scale)

**Files:** `src/utils/camera/composeBodyMvp.ts` (add a per-axis scale variant),
`src/services/engine/frame/passes/starSpheresLayer.ts` (wire oblateness),
`tests/utils/camera/composeBodyMvp.test.ts` (add a test).

**Change (spec §5 "Oblateness render", addendum 4):** oblateness is a **per-axis scale of
the CPU-side MVP composition** — the equatorial axes scale by `radiusMpc`, the polar axis
by `radiusMpc·(1 − oblateness)`. **No uniform or shader change** (`starRenderer.ts` mat4 +
tint is untouched). `composeBodyMvp` currently scales uniformly
(`composeBodyMvp.ts:77-80` builds `mat4d.scaling([r,r,r])`). Grow it to accept a per-axis
scale (implementer's choice: an optional third scale component, or a small variant fn) so
`starSpheresLayer` can pass `[r, r, r·(1−oblateness)]`. `starSpheresLayer.ts:106-114`
composes each sphere; spherical stars (no `oblateness`) take the existing uniform path.

**Which axis is polar:** the sphere is a unit sphere in model space; pick the model-space
axis that maps to the star's spin/pole. Since the seed carries no pole orientation, use the
model **Z** axis as polar (document the simplification — a fuller pole vector is a future
field). The point of this task is that **the code path lands now**; visual proof comes with
plan 02's oblate entries (Achernar ~0.35). None of the 26 initial stars are oblate.

- [x] Grow `composeBodyMvp` to a per-axis scale (default uniform preserves every existing
      caller — Earth, planets). Update its docblock (why per-axis; the polar-Z
      simplification).
- [x] Wire `starSpheresLayer.draw` to pass the per-axis scale derived from `star.oblateness`
      (absent ⇒ uniform). Update the layer header's radius note.
- [x] Test `oblate body flattens the polar axis` — compose an MVP for a body with
      `oblateness = 0.5` and one without; assert the polar-axis extent of the transformed
      unit sphere is **half** the equatorial extent (transform a `+Z` unit point vs a `+X`
      unit point through the model portion and compare — a hand-computed geometric
      property, not a mirror of the compose maths).
- [x] `npm test -- composeBodyMvp` → green. Commit.

## Task 8 — Gaia dedup reads the seed; delete the standalone table

> **Post-merge rescope (origin/main merged mid-plan, PRs #442/#443):** the Rust
> star-catalog builder now hardcodes a 17-id copy of the dedup set
> (`tools/stars-rs/src/population.rs` `FAMOUS_STAR_GAIA_IDS: [u64; 17]`) — a second
> source of truth this task must also eliminate. Additional scope:
> `buildFamousStars` gains a third emit target — a generated, committed Rust const
> (e.g. `tools/stars-rs/src/famous_ids.generated.rs`, same GENERATED-banner
> pattern as the TS table) — `population.rs` consumes it via `include!`/module and
> the hardcoded array is deleted. Verify with `cargo check` in `tools/stars-rs/`.
> The TS import site moved to `buildStars.ts:92` (set build ~`:759`) after the merge.

**Files:** `tools/stars/buildStars.ts` (modify — replace the import + set build),
`tools/catalog/famousStarGaiaIds.ts` (**DELETE**),
`tests/tools/catalog/famousStarGaiaIds.test.ts` (**DELETE**),
`tests/tools/stars/buildStars.test.ts` (add a fixture assertion).

**Change (spec §9):** `buildStars.ts:88` imports `FAMOUS_STAR_GAIA_IDS`; `:604-606` builds
`famousGaiaIds = new Set(Object.values(FAMOUS_STAR_GAIA_IDS).filter(v => v !== null))`.
Replace both:

- Import `parseFamousStarsSeed` (Task 3); read the seed via
  `rawDataPath('famous-stars.seed')`; map each entry's non-null `gaiaDr3` through
  `BigInt(...)` into the `ReadonlySet<bigint>` `selectStars` already consumes (`:162`,
  `:604-615`). Dropping `null`s reproduces today's behaviour.
- **Delete** `tools/catalog/famousStarGaiaIds.ts` + its test (delete-proxy-surfaces rule).
  The coverage invariant already moved to the parser tests (Task 3).

- [ ] Replace the import + `famousGaiaIds` construction in `buildStars.ts` with the
      seed-derived set (add a didactic line: the seed is the single source of the dedup
      fact now).
- [ ] Delete `famousStarGaiaIds.ts` and `tests/tools/catalog/famousStarGaiaIds.test.ts`.
      Grep for any other importer of `FAMOUS_STAR_GAIA_IDS` and confirm none remain.
- [ ] Test (in `buildStars.test.ts`, extending the existing synthetic-fixture test) `a
      seed entry's non-null gaiaDr3 is subtracted and a null entry subtracts nothing` —
      feed a tiny fixture seed (one Gaia-matched entry, one `null` entry) through the
      seed→set path and assert the matched `source_id` is removed while the `null` entry
      contributes no subtraction (the behaviour the deleted table's coverage test guarded,
      spec §10).
- [ ] `npm test -- buildStars` → green. Commit.

## Task 9 — Search: ungate bodies, star aliases, constellation secondary

**Files:** `src/data/bodies/famousStarsIndex.ts` (new — the shared derived index),
`src/components/CommandPalette/utils/rankPaletteMatches.ts` (modify),
`src/components/CommandPalette/paletteRows.tsx` (modify `ROW_VIEW.body`),
`tests/components/CommandPalette/utils/rankPaletteMatches.test.ts` (modify).

**Shared index (spec §8 — one derivation, two consumers: this task's search + Task 11's
`buildFocusable`; keeps the table-derivation un-braided):**

```ts
// src/data/bodies/famousStarsIndex.ts — derived once from FAMOUS_STARS_GENERATED
export const FAMOUS_STAR_IDS: ReadonlySet<string>;                                  // Task 11 consumes
export const FAMOUS_STAR_SEARCH: ReadonlyMap<string, { names: readonly string[]; constellation: string }>;
```

**`rankPaletteMatches` (spec §8, addendum 3):**

- **Remove the `hasUrlGate('deepZoom')` gate** for **every** body kind
  (`rankPaletteMatches.ts:94-101`) — Earth, planets, and stars are always searchable (no
  per-kind special case). Delete the now-obsolete stranding-rationale comment.
- For a body in `FAMOUS_STAR_SEARCH`, score over its full `names[]` (so "Alpha Orionis"
  and "Betelgeuse" both hit). For Earth/planets (not in the map), fall back to
  `[body.label]` — current behaviour.
- The `ScoredRow` body variant carries the resolved `names` + secondary label so
  `ROW_VIEW.body` can render them (spec §8 — one row-view branch, no new row *kind*). Grow
  the `body` variant in `paletteRowModel.ts:36-41` minimally if needed to carry
  `names`/`constellation` (or resolve them in `ROW_VIEW` from the index — implementer's
  call, keep it one place).

**`paletteRows.tsx` `ROW_VIEW.body` (`paletteRows.tsx:105-118`):** star rows show
`names[0]` primary and `names.slice(1)` + **constellation** secondary (e.g. "Betelgeuse" ·
"Orion"); Earth/planets keep the "Solar System" chip (spec §8).

**Tests (spec §10):**

- [ ] Add `famousStarsIndex.ts` (didactic header: single derivation feeding search +
      focusable).
- [ ] Remove the gate + add the alias/constellation resolution in `rankPaletteMatches`.
- [ ] Update `ROW_VIEW.body` for the star constellation/aliases secondary.
- [ ] Test `a star is findable by its Bayer alias without the deepZoom gate` — with **no**
      `deepZoom` URL gate set, a query for a Bayer name (e.g. "Alpha Canis Majoris")
      surfaces the Sirius body row. (Regression: pins both the ungate AND the alias
      scoring.)
- [ ] Test `a body row appears without the gate` — a query matching a body label returns a
      `kind: 'body'` row with no gate present (the addendum-3 ungate).
- [ ] `npm test -- rankPaletteMatches` → green. Commit.

## Task 10 — InfoCard meta: fetcher + hook

**Files:** `src/services/loading/fetchers/famousStarsMetaFetcher.ts` (new),
`src/hooks/useFamousStarsMeta.ts` (new),
`tests/services/loading/fetchers/famousStarsMetaFetcher.test.ts` (new).

Mirror the galaxy twins (spec §7 decision (b) — React-side lazy fetch, engine-untouched):

- `famousStarsMetaFetcher` mirrors `famousMetaFetcher.ts:24-44`: fetch
  `dataUrl('famous_stars_meta.json')`, `throw HttpError` on `!ok`, parse the array
  (`parseFamousStarsMeta` public for unit test). Tier-agnostic.
- `useFamousStarsMeta` mirrors `useFamousMeta.ts:30-55`: fetch once at mount, return
  `{ meta, ready }`, **fail-soft** (empty + `ready=true` on 404 so a build without the
  sidecar doesn't deadlock).

- [ ] Add both files with didactic headers matching their galaxy twins (why throw on 404 in
      the fetcher; why catch → fail-soft in the hook).
- [ ] Test `parseFamousStarsMeta rejects a non-array root` and `parses an array of
      entries` (mirror `famousMetaFetcher`'s parse contract — a genuine parse boundary, not
      a type restatement).
- [ ] `npm test -- famousStarsMetaFetcher` → green. Commit. (The hook is exercised by the
      card test in Task 12; a standalone hook test that only asserts fail-soft state is fine
      if it drives a mocked fetcher — implementer's call, but don't test React state that
      the card test already covers.)

## Task 11 — Focusable / selection-row / URL-hash table growth (star-only body arm)

**Files (each grows one row/variant):**
`src/@types/engine/FocusableTargetType.d.ts`, `src/@types/engine/FocusableTarget.d.ts`,
`src/@types/engine/SelectionRow.d.ts`, `src/services/engine/helpers/extractSelectionRow.ts`,
`src/services/engine/helpers/buildFocusable.ts`, `src/hooks/urlHashFor.ts`, and their
tests. Spec §7 "The `body` FocusableTarget arm" + **correction 1**.

- **`FocusableTargetType`** (`FocusableTargetType.d.ts:4`) gains `'body'`.
- **`FocusableTarget`** (`FocusableTarget.d.ts:19`) gains the `StarInfo` arm (Task 1's type).
- **`SelectionRow`** body arm (`SelectionRow.d.ts:24-29`) gains `label`; the sidecar's
  arrival is async, so the name must not wait on it. `extractSelectionRow.ts:34-43`'s body
  arm adds `label: body.label` (still no `ResolveDeps` member, still compile-time seed).
- **`buildFocusable`** body arm (`buildFocusable.ts:26`, today `() => null`) becomes
  **star-only per correction 1**: `(row) => FAMOUS_STAR_IDS.has(row.id) ? { type:'body',
  id: row.id, label: row.label, positionMpc: row.positionMpc, radiusKm: row.radiusKm } :
  null`, importing `FAMOUS_STAR_IDS` from `famousStarsIndex.ts` (Task 9 — static sync
  import, `buildFocusable` stays pure). Non-star bodies (Earth, planets) return `null`.
  Update the module header (the body arm is star-only; Earth/planets stay body-unaware).
- **`URL_HASH_FOR`** (`urlHashFor.ts:21-30`) gains a `body` row →
  `(t) => t.type === 'body' ? t.id : null`. The `#focus=body-<id>` codec already
  round-trips (`resolveFocusId.ts:119-122` → `{type:'body',id}`). A non-star body never
  reaches a focusable (buildFocusable returned null), so no hash — by construction.

**Tests (spec §10):**

- [ ] Grow each type + table row above. Confirm `DETAIL_CARD` (Task 12) is the only
      remaining `FocusableTargetType` consumer that must also gain the `body` key —
      `tsc`'s exhaustive `Record<FocusableTargetType, …>` will flag it; note that Task 12
      lands that row.
- [ ] Test `buildFocusable returns StarInfo for a star id and null for a non-star id` —
      a body row whose id is in `FAMOUS_STARS_GENERATED` (e.g. `'sirius'`) → `StarInfo`
      with `type:'body'`, `label`, `positionMpc`, `radiusKm`; a body row for `'earth'` →
      `null` (correction 1's star-only guard — the load-bearing branch).
- [ ] Test `#focus=body-<id> round-trips for a star` — `URL_HASH_FOR.body({type:'body',
      id:'sirius', …})` yields `'sirius'`, and `resolveFocusId('body-sirius')` yields
      `{type:'body', id:'sirius'}` (reuse the existing focus-id codec test shape; spec
      §10 deep-link test).
- [ ] `npm test` for the touched suites → green. Commit. (If `DETAIL_CARD`'s missing `body`
      key breaks `tsc` here, land Task 12's `DETAIL_CARD` row in the same or the next commit
      so the tree typechecks — sequence Task 12 immediately after.)

## Task 12 — `StarDetailCard` + `CompactStarCard` + `DETAIL_CARD` row

**Files:** new component folders under `src/components/InfoCard/` (via the create-component
skill), `src/components/InfoCard/detailCardTable.ts` (add the `body` row),
`tests/components/InfoCard/StarDetailCard.test.tsx` (new).

**Task text MUST tell the implementer:** load the **`create-component` skill FIRST** — each
component gets its own folder, `<Name>.tsx` + `<Name>.module.css`, one component per file,
`function Name(){}` + `export default Name`, top-level `.root` class, shared vocabulary via
`composes`. (Subagents don't auto-load project skills — naming it here is the only channel.)

- **`StarDetailCard`** — given `StarInfo`, calls `useFamousStarsMeta()` (Task 10), looks up
  `meta.find(m => m.id === target.id)`, and renders: headline (`label`); an "also known as"
  line from `entry.names.slice(1)` (the `GalaxyDetailCard.tsx` famous-names +
  `DescriptionBlock` idiom); a properties block (constellation, spectral type, distance,
  V/abs mag, radius, temperature, and — **only when present** — mass, luminosity, age,
  plus a variability line when `variable` is set); and the curated `description`. **Before
  the sidecar resolves (or on a dev clone with no sidecar): headline + name only** (the
  fail-soft path). Closest template: `MilkyWayDetailCard`.
- **`CompactStarCard`** — the hover preview: headline + constellation, **no** fetch
  dependency (name comes from `StarInfo.label`).
- **`DETAIL_CARD`** (`detailCardTable.ts:64-110`) gains a `body` row → `Detail:
  StarDetailCard`, `Compact: CompactStarCard`, each narrowing `target.type === 'body'`
  (mirror the existing arms). This completes the `Record<FocusableTargetType, …>`
  exhaustiveness from Task 11.

**Tests (spec §10 — targeted branch assertions, NOT a full-object snapshot):**

- [ ] Build both cards via the create-component skill; add the `DETAIL_CARD` `body` row.
- [ ] Test `renders headline + also-known-as + description from resolved meta` — mock
      `useFamousStarsMeta` to return one entry; assert the headline, an alias from
      `names.slice(1)`, and the description text appear.
- [ ] Test `renders headline only before meta resolves` — mock the hook `{ meta: [], ready:
      false }` (or `ready:true` empty); assert the headline shows and no properties block /
      no crash (fail-soft).
- [ ] Test `omits absent optional properties` — a meta entry without `massSolar`/`ageGyr`
      renders no mass/age line (correction 4 — the card drops absent lines).
- [ ] `npm test -- StarDetailCard` → green. Commit.

## Task 13 — R2 `ALLOW` row + docstring

**Files:** `tools/deploy/syncR2.ts` (extend `ALLOW`, `syncR2.ts:109-160`),
`tests/tools/deploy/syncR2.test.ts` (modify the existing ALLOW test).

**Change (spec §9):** add `name === 'famous_stars_meta.json'` to the `ALLOW` predicate
beside `famous_meta.json` (`syncR2.ts:140`), with a didactic comment (the star meta sidecar
is a gitignored build artefact shipped only via R2, exactly like `famous_meta.json`).

- [ ] Add the clause + comment.
- [ ] Test `ALLOW accepts famous_stars_meta.json` — extend the existing ALLOW test with the
      new name passing (an independent behavioural check, not a restatement of the full
      filter list).
- [ ] `npm test -- syncR2` → green. Commit.

## Task 14 — Entanglement-radar review (house convention)

**Files:** none (review task). Run the `entanglement-radar` skill over the full plan-01
diff. Specifically check:

- The **shared derived index** (`famousStarsIndex.ts`) is the ONE derivation of
  `FAMOUS_STARS_GENERATED` for both search and `buildFocusable` — no second Map/Set built
  independently (the un-braiding this plan committed to).
- The **star-only body guard** (correction 1) lives in exactly one place
  (`buildFocusable` via `FAMOUS_STAR_IDS`), not re-checked in `URL_HASH_FOR` /
  `extractSelectionRow` (they follow by construction).
- The **seed is the single source** of both the render table and the Gaia-dedup set — no
  residual reference to the deleted `famousStarGaiaIds.ts`.
- The generated `.ts` is written by exactly one tool and consumed synchronously; no second
  parse path.

- [ ] Run `entanglement-radar`; if it names a knot, either fix it in a follow-up commit
      (main thread edits or a dispatched implementer) or record why it's essential. Report
      findings.

## Task 15 — Final gates

**Files:** none (verification + hygiene).

- [ ] `npm run typecheck` (both src + tools tsconfigs) → green.
- [ ] `npm test` (full suite) → green.
- [ ] `npm run format` on **touched files only** (never repo-wide).
- [ ] Confirm `data/seeds/famous_stars.seed.json` + `src/data/bodies/famousStars.generated.ts`
      are committed together and in sync (re-run `npm run build-famous-stars`; the generated
      file should not change → `git diff` clean). Commit any final formatting.

---

## Self-review checklist (before marking the plan done)

- Every in-scope spec requirement maps to a task: §2 schema → Tasks 1, 3; §3 pipeline
  artefacts → Task 4; §4 parser/validation → Task 3; §5 rendering (derivation, maker,
  palette, oblateness, LOD-by-real-radius) → Tasks 6, 7; §6 blackbody util → Task 2; §7
  InfoCard/meta/deep-links → Tasks 10, 11, 12; §8 search → Task 9; §9 Gaia dedup + R2 →
  Tasks 8, 13. Initial seed (batch 0) → Task 5.
- The four corrections are baked in: star-only body arm (Tasks 11, 12), `distancePc >= 0`
  (Task 3, Task 5), no `names[1]` requirement (Task 3, Task 5), optional
  mass/luminosity/age (Tasks 1, 3, 4, 12).
- No test restates a constant, mirrors the source formula, or runtime-tests a type
  declaration. The blackbody test asserts directional relationships; the oblateness test a
  hand-computed geometric ratio; the seed-parser tests hand-built fixtures.
- No implementation bodies pasted; existing code cited by `path:line`.
- The committed-together seed+generated workflow is stated in Tasks 4, 5, 15.
