# Star identity joint + complete bright-star dedup (Constellations Prep 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to execute this plan. Each task is a self-contained TDD unit (write failing test →
> run → implement → run → commit). Do not batch tasks; dispatch one implementer per
> task with the spec, this plan, and the two conventions docs
> (`docs/superpowers/conventions/plan-style.md`, `docs/superpowers/conventions/testing.md`)
> in hand.

## Goal

Give the `stars-rs` population a **source-identifier sidecar that coexists with each
star's final position**, and use it to kill the visible bright-star duplicates (Alpha
Centauri and its class render twice today). This is Prep 1 of the constellations feature
(`docs/superpowers/specs/2026-07-22-constellations-design.md`, section "Prep 1 — star
identity joint + complete bright-star dedup"). It is independently valuable — it fixes
on-screen duplicates with no constellation code — and it is the joint the later
endpoint-resolver consumes.

Two mechanisms close the duplicate gap:

1. **Famous subtraction becomes Gaia ∪ HIP.** Today the bin subtracts famous stars by
   Gaia id only; 70/119 famous entries have no Gaia id (Gaia DR3 lacks the brightest,
   saturated stars), so their bright bin counterpart survives. Adding HIP as a second
   dedup key subtracts the 98 famous entries that carry a HIP alias (plus any bright
   entry the curator hand-tags, e.g. Alpha Centauri).
2. **Crossmatch-gap positional fallback.** A bright Hipparcos star (Hp < `HP_BRIGHT_CUT`)
   with no `hip2_best_neighbour.csv` row currently enters the bin twice — the Hipparcos
   patch row plus an uncontested Gaia row. The builder closes that gap itself with a
   positional match against bright Gaia sources, subtracting the Gaia twin before
   emission and reporting the count so coverage is visible in build output.

## Architecture

The identity data flows seed → generated Rust const → population:

```
famous_stars.seed.json  (adds hip: number|null per entry)
   │  npm run build-famous-stars
   ▼
famous_ids.generated.rs  (FAMOUS_STAR_GAIA_IDS  +  FAMOUS_STAR_HIP_IDS)   ← both include!()-d
   │
   ▼
build_population()  ── emits ──▶  Population { stars, ids: Vec<StarIds>, drops, clamps }
                                           └ StarIds { gaia: Option<u64>, hip: Option<u32> }
                                             parallel to stars, one push per Star, one loop
```

`StarIds` is the named joint the constellations feature (later PR) reads to resolve
polyline vertices to rendered stars. In this prep it is populated in all three loops,
kept parallel across the distance-cap `retain`, and exercised by tests — but has no
runtime consumer yet.

The famous-subtraction set is assembled once, before the loops, as `famousGaia ∪
{ hip_to_source_id[h] : h ∈ famousHip }` (a pure helper). The Hipparcos-bright loop
matches `row.hip` against `famousHip` directly, since it holds the HIP in hand. The
positional fallback set is a second pure helper unioned into the Gaia/GCNS drop test.

**TS reference build (`tools/stars/buildStars.ts`) is intentionally NOT changed in this
prep** — `build-stars-rs` is the canonical shipping builder. A `--compare` run will now
report the HIP-only-subtracted and positional-gap-subtracted stars as expected deltas
against the older TS reference bins; that is not a regression (`run_compare` in `main.rs`
only prints stats, it does not gate).

## Tech Stack

- **Seed + generator (TS):** `tools/parsers/famousStarsSeed.ts`,
  `tools/famous/buildFamousStars.ts`, vitest. Regen: `npm run build-famous-stars`.
- **Builder (Rust):** `tools/stars-rs` — single crate, no workspace, no serde (deps:
  rayon, flate2, rustc-hash). Tests colocate in `#[cfg(test)] mod tests` **inside each
  source file** (see `parse.rs:253`, `taper.rs:78`, `format.rs:222`); there is no
  `tests/` dir. Run: `cargo test --manifest-path tools/stars-rs/Cargo.toml` (no npm
  alias exists; `build-stars-rs` in `package.json:41` is the `cargo run` analogue).

## Global Constraints

- Follow `docs/superpowers/conventions/plan-style.md`: the plan pins contracts
  (signatures, struct shapes, test names + assertions), not bodies. Cite existing code
  by `file:line`.
- Follow `docs/superpowers/conventions/testing.md`: no mirror tests (never compute the
  expected value with the source's own formula), no constant/registry restatements, no
  source-text greps. The Rust tests here are behavioral (build a synthetic population,
  assert what is subtracted / what ids land); the TS validation tests assert the throw
  branch, not the literal.
- Rust comment style is **didactic module + item headers** — match the existing
  `population.rs` / `parse.rs` prose density; explain *why*, not *what*.
- `famous_ids.generated.rs` is committed codegen: never hand-edit it; regenerate via the
  npm script and commit the result.
- Determinism: the Gaia loop is `par_chunks`-parallel and assembled in page order
  (`population.rs:160-200`). Any new per-star `ids` output must ride the same
  ordered-flatten so `ids` stays byte-order-parallel to `stars` independent of thread
  count.
- `data/seeds/*.json` is committed (already re-included by the `.gitignore` globs — no
  gitignore edit).

---

## Task 1 — Seed: structured `hip` field + type + validation

Add a `hip: number | null` field to every famous-star entry and enforce it in the seed
parser. Values come from the existing `"HIP n"` alias in `names[]` (98/119 entries);
entries with no HIP alias get `null` — **except** that a curator may set a non-null `hip`
on an aliasless entry when a real HIP exists (e.g. `alpha-centauri` → 71683,
`names[]` = `[…, "HD 128620"]` with no HIP alias, `population.rs:44`). The Sun keeps
`null`.

**Files:**
- Modify `tools/parsers/famousStarsSeed.ts` — add `hip` to `FamousStarEntry`
  (`:36-94`) and to `validateFamousStarEntry` (`:101-209`).
- Modify `data/seeds/famous_stars.seed.json` — add `hip` to all 119 entries.
- Modify `tests/tools/parsers/famousStarsSeed.test.ts` — extend `baseEntry` (`:10-28`)
  with `hip`, add tests.

**Interfaces**

_Produces:_
```ts
// FamousStarEntry gains:
/** Hipparcos catalog number (HIP), or null when the star has no HIP row.
 *  Second dedup key alongside gaiaDr3: Gaia DR3 lacks the saturated bright stars. */
hip: number | null
```
Validation rule: `hip` is a REQUIRED own-property (a missing key throws, mirroring the
`gaiaDr3` "not-yet-resolved must not read as null" invariant at `:195-197`); value is
either `null` or a positive integer. **Consistency:** when a `"HIP n"` alias is present
in `names[]`, `hip` must equal `n` — catches drift between the two hand-authored fields.
A non-null `hip` with no HIP alias is allowed (the Alpha-Centauri enrichment case).

**Steps**
- [ ] Add failing tests to `famousStarsSeed.test.ts`:
  - `throws on a missing hip field` — delete `hip` key (as the `gaiaDr3` test at `:36`
    does), expect `/hip/`.
  - `accepts hip: null` — a Sun-style entry, `validateFamousStarEntry(e).hip` is `null`.
  - `throws on a non-integer or non-positive hip` — `hip: 1.5`, `hip: -1`, `hip: 0` each
    throw `/hip/`.
  - `throws when hip disagrees with a HIP alias` — `names: ['X','HIP 100']`, `hip: 200`
    throws `/hip/`; `hip: 100` passes.
  - `allows a non-null hip with no HIP alias` — `names: ['X']`, `hip: 71683` passes.
- [ ] Run `npm test -- famousStarsSeed` → red.
- [ ] Add `hip` to `FamousStarEntry` + `baseEntry` fixture; implement the validation
  branch (own-property check + null-or-positive-int + alias consistency). A helper to
  extract the HIP integer from a `"HIP n"` alias belongs in this module (one small pure
  fn); reuse it in the consistency check.
- [ ] Author `hip` into all 119 seed entries: derive from the `"HIP n"` alias where one
  exists, else `null`. Additionally set the real HIP on the aliasless saturated bright
  stars that render as duplicates today (at minimum `alpha-centauri` → 71683). Sun →
  `null`.
- [ ] Extend the real-seed block (`famousStarsSeed.test.ts:142-152`): every parsed entry
  has a `hip` own-property; the Sun's is `null`; and for every entry whose `names[]`
  contains a `"HIP n"`, `hip === n`.
- [ ] Run `npm test -- famousStarsSeed` → green.
- [ ] Commit.

## Task 2 — Generator: emit `FAMOUS_STAR_HIP_IDS`

`build-famous-stars` regenerates `famous_ids.generated.rs` with a `FAMOUS_STAR_HIP_IDS`
`[u32; M]` array next to the existing `FAMOUS_STAR_GAIA_IDS` (`famous_ids.generated.rs:10`).

**Files:**
- Modify `tools/parsers/famousStarsSeed.ts` — add `selectHipEntries` next to
  `selectDedupEntries` (`:230-234`).
- Modify `tools/famous/buildFamousStars.ts` — extend `seedToRustConst` (`:174-181`) to
  append the HIP array; update `RUST_GENERATED_BANNER` (`:154-163`) to describe both.
- Modify `tests/tools/famous/buildFamousStars.test.ts` — add `hip` to `FIXTURE`
  (`:21-74`), add a `seedToRustConst`/hip assertion.
- Modify `tests/tools/parsers/famousStarsSeed.test.ts` — a `selectHipEntries` test.
- Regenerate + commit `tools/stars-rs/src/famous_ids.generated.rs`.

**Interfaces**

_Consumes:_ `FamousStarEntry.hip` (Task 1).

_Produces:_
```ts
// famousStarsSeed.ts — mirrors selectDedupEntries (:230); one home, seed order preserved.
export function selectHipEntries<T extends Pick<FamousStarEntry, 'hip'>>(
  entries: readonly T[],
): (T & { hip: number })[]
```
```rust
// famous_ids.generated.rs — appended after FAMOUS_STAR_GAIA_IDS:
pub const FAMOUS_STAR_HIP_IDS: [u32; M] = [ /* hip, // id */ ];
```
`seedToRustConst(entries)` now emits banner + the `FAMOUS_STAR_GAIA_IDS` array (unchanged)
+ the `FAMOUS_STAR_HIP_IDS` array, each id tagged with its star `id` as a provenance
comment, in seed order. `M` = count of non-null-`hip` entries.

**Steps**
- [ ] Add failing test to `famousStarsSeed.test.ts`: `selectHipEntries drops null-hip
  entries` — a two-entry input (one `hip: 100`, one `hip: null`) returns length 1 with
  the narrowed `hip: number`.
- [ ] Add failing test to `buildFamousStars.test.ts`: give `FIXTURE` `hip` values
  (sirius 32349, achernar 7588, proxima `null` — proxima already demonstrates the
  gaiaDr3-null exclusion at `:71`). New test `emits a u32 array of the non-null hip ids`:
  `seedToRustConst(FIXTURE)` contains `pub const FAMOUS_STAR_HIP_IDS: [u32; 2] = [`,
  `32349, // sirius`, `7588, // achernar`, and does not mention proxima in the hip array.
- [ ] Run `npm test -- famousStarsSeed buildFamousStars` → red.
- [ ] Implement `selectHipEntries` (filter `hip !== null`, narrow the type — clone the
  `selectDedupEntries` shape). Extend `seedToRustConst` to append the HIP array via
  `selectHipEntries`; update the banner.
- [ ] Run `npm test -- famousStarsSeed buildFamousStars` → green.
- [ ] Run `npm run build-famous-stars`; confirm `famous_ids.generated.rs` now carries
  both consts. Commit the regenerated `.rs` alongside the code + seed.
- [ ] Commit.

## Task 3 — Rust: `StarIds` joint, `ids` parallel to `stars`

Add the identity sidecar and populate it in all three loops, keeping it parallel through
the distance cap. No dedup behavior change yet.

**Files:**
- Modify `tools/stars-rs/src/population.rs` — `StarIds`, `Population.ids`, the three Star
  pushes (`:184-190`, `:225-231`, `:242-248`), the `retain` cap (`:258-264`).
- Modify `tools/stars-rs/src/main.rs` — `Population` is constructed in `population.rs`;
  no printing change required here (the ids field is additive). Verify it still compiles.

**Interfaces**

_Produces:_
```rust
/// Source identifiers for one population star, parallel to `Population.stars`.
/// The identity joint the constellation endpoint-resolver (later PR) reads to
/// map a polyline vertex to the exact rendered star.
pub struct StarIds { pub gaia: Option<u64>, pub hip: Option<u32> }

pub struct Population {
    pub stars: Vec<Star>,
    pub ids: Vec<StarIds>,   // ids[i] identifies stars[i]
    pub drops: DropCounts,
    pub clamps: ClampCounts,
}
```
Per-loop id assignment:
- Gaia mains (`:184`): `gaia: Some(row.source_id)`, `hip: source_id_to_hip[source_id]`.
- GCNS-only (`:225`): `gaia: Some(row.source_id)`, `hip: source_id_to_hip[source_id]`.
- Hipparcos-bright (`:242`): `hip: Some(row.hip)`, `gaia: hip_to_source_id[row.hip]`.

`source_id_to_hip: FxHashMap<u64, u32>` is the inverse of the `hip_to_source_id`
crossmatch (`main.rs:88`), built once at the top of `build_population` (arbitrary winner
on the rare many-HIP→one-source collision — note it in a comment).

**Constraint:** the Gaia loop's `par_chunks` tuple (`:160`, currently
`(Vec<Star>, u64, u64, u64)`) must also carry the chunk's `Vec<StarIds>` (or a
`Vec<(Star, StarIds)>`) so `ids` flattens in the same page order as `stars`. The cap
`retain` (`:258-264`) must drop from `stars` and `ids` in lockstep.

**Steps**
- [ ] Add failing tests to a new `#[cfg(test)] mod tests` in `population.rs` (pattern:
  `parse.rs:253`). Synthetic inputs (fabricate `GaiaMainRow` / `GcnsRow` / `Hip2Row`
  literals with source_ids and HIPs **not** present in `FAMOUS_STAR_GAIA_IDS` /
  `FAMOUS_STAR_HIP_IDS`, so nothing is subtracted):
  - `ids stay parallel to stars across all three loops` — one Gaia main, one GCNS-only
    (source_id absent from the Gaia set), one bright Hipparcos row; a `hip_to_source_id`
    mapping the Hipparcos HIP to a source_id. Assert `pop.ids.len() == pop.stars.len()`,
    and that each `StarIds` carries the expected `gaia`/`hip` (Gaia row → `Some(id)` +
    reverse-mapped hip; Hipparcos row → `Some(hip)` + mapped gaia).
  - `distance cap drops a star and its ids in lockstep` — add a star beyond
    `MAX_STAR_DISTANCE_PC` (`:51`); assert it is absent from both `stars` and `ids`, the
    two vecs remain equal length, and `drops.far_distance == 1`.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → red.
- [ ] Add `StarIds`, `Population.ids`, `source_id_to_hip`; thread the ids through the
  three pushes and the cap. Match the module's didactic comment style.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → green.
- [ ] Commit.

## Task 4 — Rust: famous subtraction = Gaia ∪ HIP

Extend the subtraction to key on HIP as well as Gaia id.

**Files:**
- Modify `tools/stars-rs/src/population.rs` — read `FAMOUS_STAR_HIP_IDS`; add the union
  helper; wire it into the Gaia/GCNS membership test (`:180`, `:221`) and the
  Hipparcos-bright loop (`:236-241`).

**Interfaces**

_Consumes:_ `FAMOUS_STAR_HIP_IDS` (Task 2), `hip_to_source_id` (`main.rs:88`).

_Produces:_
```rust
/// Gaia source_ids to subtract as famous: the curated Gaia ids unioned with the
/// Gaia ids that the famous HIP stars resolve to through the crossmatch. HIP-only
/// famous stars (no gaiaDr3 — the saturated bright stars) are subtracted this way.
fn famous_gaia_subtraction(
    famous_gaia: &FxHashSet<u64>,
    famous_hip: &FxHashSet<u32>,
    hip_to_source_id: &FxHashMap<u32, u64>,
) -> FxHashSet<u64>
```
- Gaia + GCNS loops test membership in this union instead of `famous.contains` (`:180`,
  `:221`); the counter stays `famous_subtracted`. Precedence is unchanged: `hip_matched`
  (`:176`, `:217`) is still tested strictly before the famous union.
- Hipparcos-bright loop (`:236-241`): subtract when the crossmatched gaia id is in
  `famous_gaia` (existing) **or** `row.hip ∈ famous_hip` (new); increment
  `famous_subtracted`.

**Steps**
- [ ] Add failing tests to `population.rs` `mod tests`:
  - `famous_gaia_subtraction unions hip-resolved ids` — `famous_gaia = {}`,
    `famous_hip = {5}`, `hip_to_source_id = {5→999}`; result contains 999. A famous HIP
    with no crossmatch entry contributes nothing (result excludes it).
  - `hip-only famous star is subtracted from the bin` — pick a real HIP from
    `FAMOUS_STAR_HIP_IDS`; a synthetic bright Hipparcos row with that HIP is **not**
    emitted (absent from `pop.stars`), and `drops.famous_subtracted` counts it.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → red.
- [ ] Build `famous_hip: FxHashSet<u32>` from `FAMOUS_STAR_HIP_IDS`; implement
  `famous_gaia_subtraction`; replace the two Gaia/GCNS famous tests with a union
  membership test; add the `row.hip` check in the Hipparcos loop.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → green.
- [ ] Commit.

## Task 5 — Rust: crossmatch-gap positional fallback + `DropCounts` field

Close the last duplicate class: a bright Hipparcos star (Hp < `HP_BRIGHT_CUT`) with no
crossmatch row, whose Gaia twin therefore survives uncontested.

**Files:**
- Modify `tools/stars-rs/src/population.rs` — the gap consts, the positional helper, the
  new drop set + membership test in the Gaia/GCNS loops, the new `DropCounts` field
  (`:72-79`).
- Modify `tools/stars-rs/src/main.rs` — print the new drop field in the population
  summary (`:110-122`).

**Interfaces**

_Consumes:_ `hip_to_source_id`, the bright Hipparcos rows (`:137`), the Gaia rows.

_Produces:_
```rust
// Starting values — tune from the build-output coverage line, then pin.
// Bright Hipparcos vs Gaia positions are both J2000 but ~25 yr apart in epoch, so
// a high-proper-motion bright star can drift arcseconds; ~30 arcsec is a safe
// non-false-matching radius given how sparse bright stars are.
pub const GAP_MATCH_RADIUS_DEG: f64 = 0.008_333; // 30 arcsec
pub const GAP_MATCH_MAG_WINDOW: f64 = 1.0;        // |Hp − G| upper bound
pub const GAP_MATCH_MAX_GAIA_MAG: f64 = 6.0;      // bright-Gaia prefilter (Hp<4 + window + margin)

// DropCounts gains:
pub positional_gap_subtracted: u64,

/// Gaia source_ids to additionally subtract because they duplicate a bright
/// Hipparcos star that is missing from the crossmatch. For each unmatched bright
/// Hipparcos star, the nearest bright Gaia source within GAP_MATCH_RADIUS_DEG whose
/// magnitude is within GAP_MATCH_MAG_WINDOW of Hp.
fn positional_gap_subtraction(
    unmatched_bright_hip: &[&Hip2Row],
    bright_gaia: &[&GaiaMainRow],   // prefiltered to g_mag <= GAP_MATCH_MAX_GAIA_MAG
    radius_deg: f64,
    mag_window: f64,
) -> FxHashSet<u64>
```
- "Unmatched bright Hipparcos" = `hip_bright` rows with `hip_to_source_id.get(&row.hip)
  == None`.
- Angular distance must be a real great-circle / unit-vector metric (cos-dec weighting,
  RA wrap) — reuse the frame in `ra_dec_dist_to_cartesian` (`:106-112`) via a
  dot-product on unit vectors; a naive `(Δra, Δdec)` Euclidean is wrong near the poles.
- The returned set is unioned into the Gaia/GCNS drop test, tested **after** the famous
  union (a row that is both counts famous first, matching existing precedence). Dropped
  rows increment `positional_gap_subtracted`, NOT `famous_subtracted`.

**Steps**
- [ ] Add failing tests to `population.rs` `mod tests`:
  - `positional_gap_subtraction matches a bright Gaia twin within radius and mag window`
    — one unmatched bright Hipparcos star; a bright Gaia row ~10 arcsec away with
    `|Hp − G| < window` → result contains that source_id.
  - `positional_gap_subtraction rejects a Gaia row outside the radius` and
    `… outside the mag window` → empty set (two assertions / two tests).
  - `crossmatch-gap fallback dedupes a synthetic missing-xmatch bright star` — full
    `build_population`: a bright Hipparcos row whose HIP is absent from
    `hip_to_source_id`, plus a nearby matching bright Gaia row (source_id not in the
    famous sets). Assert the Gaia row is absent from `pop.stars`, the Hipparcos version
    is present, `drops.positional_gap_subtracted == 1`, and the star appears exactly
    once.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → red.
- [ ] Add the consts + `DropCounts` field; implement `positional_gap_subtraction`
  (prefilter Gaia to `g_mag <= GAP_MATCH_MAX_GAIA_MAG` once, brute-force nearest within
  that small set); union the result into the Gaia/GCNS drop test with the new counter;
  add the field to the `main.rs` summary line.
- [ ] Run `cargo test --manifest-path tools/stars-rs/Cargo.toml` → green.
- [ ] Commit.

---

## Verification

- [ ] `cargo test --manifest-path tools/stars-rs/Cargo.toml` — all Rust tests green.
- [ ] `npm test -- famousStarsSeed buildFamousStars` — TS tests green.
- [ ] `npm run typecheck` — src + tools tsconfigs clean.
- [ ] `npm run build-famous-stars` is idempotent (re-running leaves
  `famous_ids.generated.rs` unchanged) and the committed generated file carries both id
  arrays.

## Rollout

Prep 1 of the constellations spec's rollout (`spec §Rollout` step 1) — its commits land
first on the shared `worktree-constellations` branch (one PR for prep + feature, user
decision 2026-07-22). After the PR merges, the new dedup only reaches the live data once
the bins are rebuilt and re-synced — and that must run from the **main worktree**, not
this one (`project_worktree_data_isolation`):

1. `npm run build-stars-rs` (from main) — rebakes `stars-{small,medium,large}.bin` with
   the Gaia ∪ HIP subtraction + positional-gap fallback.
2. `npm run sync-r2-secure` (from main) — uploads the rebuilt bins and purges the CDN.

Until those run, the duplicate-star fix is code-only and not yet visible in production.
