# S-star orbits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the 39 bound S-stars of the Galactic Center as Keplerian bodies orbiting Sgr A\*, animated by the existing solar-system clock. "S-star" is used throughout as the collective name for the table's 39 bound rows — two of them, R34 and R44, carry Gillessen's own R designations rather than S.

**Architecture:** The feature half of [the spec](../../specs/completed/2026-07-30-s-star-orbits-design.md). Thirty-nine hand-transcribed element rows in their own file, converted by an `sStar` maker into the same `OrbitalElements` shape the planets use, focused on a Sgr A\* anchor, gated by a `galactic-centre` `BodyRegion`. Sgr A\* draws nothing; it is a positioned, labelled, focusable anchor.

**Tech Stack:** TypeScript, Vitest. No new renderers, no shader changes.

## Global Constraints

- **Depends on Plans 01 and 02.** The anchor focus graph and `BodyRegion` must both exist. Everything this plan consumes from them is specified there: `BODY_REGIONS` with `label` + `memberIds`, total-and-disjoint region membership, and `regionOfBody` (Plan 02 Task 2); `regionRelativeDistanceMpc` and the per-region band keying (Plan 02 Tasks 3–5); the region-extent-derived `FOREGROUND_MAX_DISTANCE_MPC` (Plan 02 Task 6).
- **The NEAR0 far plane is a global scalar and stays one.** It is compared against `ctx.cam.distance` — the camera's distance from its orbit _target_, not the origin — so a camera at the Galactic Centre already clears it. Do **not** build a per-region foreground predicate here, and do not retrofit a NEAR0 layer. See Task 7.
- **Data source:** Gillessen et al. 2017, ApJ 837, 30 — VizieR `J/ApJ/837/30/table3`. **S111 is excluded** (`a = −12.3″`, `e = 1.092`, unbound; `propagateElements` is elliptical-only). 39 rows.
- **1 arcsec = 8178 AU** at the GC distance. Sgr A\* at RA 266.41684, Dec −29.00781, 8178 pc.
- **Authoring discipline, copied from `orbitalElements.ts`:** no buried literals, and **each row carries its raw Gillessen table line in a comment** so the transcription stays checkable. The seed rows keep the published units in named fields (`…Arcsec`, `…Deg`, `…Yr`); every unit and frame conversion happens in the `sStar` maker (Task 5), never in the table. There, distances go through `SCALE_UNITS.…` and the sky angles through Task 3's two converters — **bare `degToRad` is correct for `ω` alone.**
- **`type` aliases, never `interface`.** One type per file in `src/@types/`; one exported function per file in `src/utils/`.
- **No S-star captions.** No S-star gets a `CaptionKind` or an emission in `sceneBodyLabels`. Only Sgr A\* bears a label — and that costs **one** new `CaptionKind` row, which `CAPTION_PRIORITY` and `CAPTION_FADE_RULES` both fail the build without (Task 7).
- **Test what can break.** Do **not** write `pericentre === a(1−e)`, `period === 2π/n`, or body-sits-on-its-own-trail assertions — a mirrored orbit passes all three. See Task 6.
- Read [docs/RENDERER.md](../../../RENDERER.md) and [docs/DATA.md](../../../DATA.md) first.

---

### Task 1: `SStarSeed` and the 39 transcribed rows

**Files:**

- Create: `src/@types/scene/SStarSeed.d.ts`
- Create: `src/data/bodies/sStarElements.ts`
- Test: `tests/data/bodies/sStarElements.test.ts`

**Interfaces — Produces:**

```ts
export type SStarSeed = {
  readonly id: string; // 's2'
  readonly label: string; // 'S2'
  readonly semiMajorArcsec: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly ascendingNodeDeg: number; // astronomical PA: North through East
  readonly argPeriapsisDeg: number;
  readonly periapsisEpochYr: number; // fractional year
  readonly periodYr: number;
  readonly kMag: number; // apparent K
  readonly spectralClass: 'early' | 'late' | 'unknown';
};

export const S_STAR_SEEDS: readonly SStarSeed[]; // 39 rows
```

Rows go in their own file, **not** appended to `orbitalElements.ts`, which is already ~700 lines for 22 rows.

**Transcription is verified once, mechanically.** Write a throwaway script that queries VizieR TAP and diffs every field against the committed table:

```
https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync
  REQUEST=doQuery LANG=ADQL FORMAT=text
  QUERY=SELECT Star, a, e, i, Omega, w, Tp, Per, SpT, Kmag FROM "J/ApJ/837/30/table3"
```

Run it, paste its clean output into the task's commit message, then **delete the script** — it is a one-off check, not standing build machinery.

- [x] Add the test `S111 is absent from the seed table` (naming why in the assertion message: `e = 1.092`, unbound, and `propagateElements` is elliptical-only). A bare `length === 39` count is a constant restatement of a hand-authored table — testing convention rejects it, and the two structural tests below catch the same transcription slips.
- [x] Add the test `every seed has a positive semi-major axis and eccentricity below 1` — the property that makes `propagateElements` applicable.
- [x] Add the test `seed ids are unique` — the copy-paste failure a 39-row hand transcription actually produces, and the one that silently collides in every id-keyed lookup downstream.
- [x] Transcribe the 39 rows with per-row provenance comments.
- [x] Run the VizieR diff script; confirm zero mismatches; delete the script.
- [x] `npm test -- sStarElements` → passes.
- [x] Commit, with the diff output in the message.

---

### Task 2: `meanAnomalyAtJ2000`

**Files:**

- Create: `src/utils/orbit/meanAnomalyAtJ2000.ts`
- Test: `tests/utils/orbit/meanAnomalyAtJ2000.test.ts`

**Interfaces — Produces:**

```ts
export function meanAnomalyAtJ2000(periapsisEpochYr: number, periodYr: number): number;
```

Gillessen tabulates a pericentre epoch `Tp`; `OrbitalElements` wants mean anomaly at J2000. `M = 2π(2000.0 − Tp) / P`, wrapped to `[0, 2π)`.

**Landmine — the wrap is not an edge case.** Over the committed 39 rows, tabulated
`Tp` runs from 611.0 (S87) to 2132 (S97), and **20 of the 39 have `Tp` after 2000**,
so `2000 − Tp` is negative and the raw mean anomaly is negative before wrapping.
JavaScript's `%` preserves the sign of the dividend, so a naive `raw % (2 * Math.PI)`
leaves those 20 stars negative — more than half the table. Every row's
`|2000 − Tp|` is under one full period (largest is S91 at 0.93 cycles; S87 is 1389 yr
against a 1640 yr period, 0.85 cycles), because Gillessen tabulates the pericentre
passage nearest the observation epoch — so one wrap suffices, but the
implementation must not _rely_ on that, since a future table row need not honour it.

- [x] Add the test `a star at pericentre in 2000.0 has mean anomaly zero`.
- [x] Add the test `S2 at Tp 2002.33 with P 16.0 wraps into [0, 2π)` — S2 is one of
      the 20 stars with `Tp` after 2000, so this asserts the wrap, which a naive
      negative result fails.
- [x] Add the test `a star with Tp before 2000 comes out unchanged` — the positive-raw
      companion to the S2 case above, so the wrap is pinned in both directions rather
      than only the negative one.
- [x] Add the test `advancing by exactly one period returns the same anomaly`.
- [x] Implement.
- [x] `npm test -- meanAnomalyAtJ2000` → passes.
- [x] Commit.

---

### Task 3: The Galactic Center sky frame and the two angle conversions

**Files:**

- Modify: `src/data/bodies/orbitPlaneFrames.ts`
- Create: `src/utils/orbit/skyPositionAngleToFrameAngle.ts`
- Create: `src/utils/orbit/skyInclinationToFrameInclination.ts`
- Test: `tests/utils/orbit/skyPositionAngleToFrameAngle.test.ts`, `tests/utils/orbit/skyInclinationToFrameInclination.test.ts`

**Interfaces — Produces:**

```ts
export const GALACTIC_CENTRE_SKY_FRAME: OrbitPlaneFrame; // planeFrameFromPole(266.41684, -29.00781)
export function skyPositionAngleToFrameAngle(omegaAstroDeg: number): number; // radians
export function skyInclinationToFrameInclination(iAstroDeg: number): number; // radians
```

**This is the highest-risk task in the plan.** The elements are referenced to the plane of the sky at the GC, whose pole is the line of sight to Sgr A\*. `planeFrameFromPole` (`orbitPlaneFrames.ts:58-69`) yields, for that pole:

```
xAxis  = [-sin α, cos α, 0]        = East    (the East tangent, at any Dec)
yAxis  = normal × xAxis  = r̂ × ê  = North
normal = direction to Sgr A*, i.e. AWAY from the observer
```

All three identities hold analytically and are **verified against the current source**: `∂r̂/∂α` normalized is `[-sin α, cos α, 0]`; `r̂ × ê = (−sinδ cosα, −sinδ sinα, cosδ) = ∂r̂/∂δ = n̂`; and `normal` is literally `r̂` (`orbitPlaneFrames.ts:61`). The triad `(ê, n̂, r̂)` is **right-handed** — `ê × n̂ = r̂`.

**Two conversions are required, not one — this is the correction the plan hinges on.**

Gillessen's elements use the standard astrometric convention: the reference basis is `(North, East, away-from-observer)` with the ascending node at the _receding_ crossing, and the position angle Ω runs North through East. That basis is **left-handed** (`n̂ × ê = −r̂`), while `GALACTIC_CENTRE_SKY_FRAME` is right-handed. The map between them is the component swap `P: (N, E, away) → (E, N, away)`, `det P = −1`.

Conjugating the standard `R = Rz(Ω)·Rx(i)·Rz(ω)` (the rotation `keplerianEllipse.ts:89-97` builds) through `P` gives, exactly:

| element | conversion                                |
| ------- | ----------------------------------------- |
| Ω       | `Ω_frame = 90° − Ω_astro`                 |
| **i**   | **`i_frame = 180° − i_astro`**            |
| ω       | `ω_frame = ω_astro` (unchanged)           |
| M       | unchanged; the anomaly still runs forward |

Derivation sketch, for the docblock: `P Rz(θ) P = Rz(−θ)`, `P Rx(θ) P = Ry(−θ) = Rz(−90°) Rx(θ) Rz(90°)`, and `P` also swaps the perifocal seed `(cos ν, sin ν, 0) → (sin ν, cos ν, 0)`, which runs the in-plane angle backwards; absorbing that reversal with `Rx(180°)` is what turns `i` into `180° − i` and leaves `ω` alone. Two hand-checked cases pin it:

- `(i, Ω, ω) = (0, 0, 0)` — Thiele-Innes puts the star at North at `E = 0` moving toward East. In the frame that is `(sin E, cos E, 0)`; `Rz(90°)Rx(180°)` reproduces it, `Rz(90°)Rx(0°)` gives the mirrored `(−sin E, cos E, 0)`.
- `(i, Ω, ω) = (90°, 0, 0)` — edge-on, receding after the node. Frame `(0, cos E, sin E)`; `Rz(90°)Rx(90°)` reproduces it.

The flip is also the physically legible statement: `i_astro < 90°` means counter-clockwise on the sky, i.e. angular momentum toward the observer, i.e. `i_frame > 90°` about a normal that points away. S2's tabulated `i ≈ 134°` (clockwise on the sky, the standard reading) becomes `i_frame ≈ 46°`.

**Converting Ω alone leaves all 39 orbits mirrored** — and inclinations span 24.7° to 171.1°, so both senses are present and the result still looks like 39 plausible ellipses. No analytic invariant catches it; Task 6 is the acceptance gate.

Write the derivation out in the docblocks so a reader can check it. If the derivation and the observations disagree, the recorded fallback is to enumerate the sign and reference combinations, keep the one that reproduces the astrometry, and document the result _as empirical_ rather than presenting it as derived.

- [x] Add the test `the GC frame's x axis is the East tangent and its y axis is North` — assert against tangent vectors computed independently in the test, not against the function's own output.
- [x] Add the test `the frame normal points away from the observer, into the southern hemisphere` — assert `normal` is a unit vector orthogonal to both in-plane axes with `normal[2] < 0` (Dec −29°). Do **not** assert the three components against `raDecDistToCartesian`: that is the same formula (`raDecDistToCartesian.ts:38-42` vs `orbitPlaneFrames.ts:61`), so it is a mirror test, not a check. The one-bit sign is what catches an antipodal pole.
- [x] Add the test `the frame basis is right-handed` asserting `xAxis × yAxis ≈ normal` — the fact the whole conversion rests on.
- [x] Add the test `a position angle of 0 (due North) maps to the frame's +y` — hand-computed `π/2`; discriminates `90° − Ω` from `Ω − 90°`.
- [x] Add the test `a prograde-on-sky inclination maps above 90 degrees in the frame` asserting `skyInclinationToFrameInclination(24.7°) ≈ 155.3°` — the sense flip; a pass-through implementation fails it.
- [x] Implement all three; write the derivation into the docblocks.
- [x] `npm test -- skyPositionAngle skyInclination orbitPlaneFrames` → passes.
- [x] Commit.

---

### Task 4: Appearance from K magnitude

**Files:**

- Create: `src/utils/star/absMagFromGalacticCentreK.ts`
- Create: `src/data/bodies/sStarAppearance.ts`
- Test: `tests/utils/star/absMagFromGalacticCentreK.test.ts`

**Interfaces — Produces:**

```ts
export function absMagFromGalacticCentreK(kMag: number): number; // dereddened M_K
export const A_KS_GALACTIC_CENTRE: number; // ≈ 2.5, a MODELLING choice, cited
export function sStarAppearance(
  mK: number,
  cls: SStarSeed['spectralClass'],
): { temperatureK: number; absMag: number; radiusSolar: number };
```

Distance modulus is 14.56 at 8178 pc. `M_K = kMag − 14.56 − A_KS_GALACTIC_CENTRE`.

| star               | K apparent | ⇒ M_K |
| ------------------ | ---------- | ----- |
| brightest in table | 10.0       | −7.1  |
| S2                 | 13.95      | −3.1  |
| faintest in table  | 17.8       | +0.74 |

S2 landing at −3.1 matches its published B0–2V classification, which sanity-checks the chain end to end — make that the headline test.

`A_KS_GALACTIC_CENTRE` is **one named constant with its source cited in a comment**, never folded into per-row numbers, because it is a modelling choice that shifts all 39 stars together and will be refined later.

- [x] Add the test `S2's dereddened M_K matches its published B0-2V classification` asserting ≈ −3.1 — hand-computed `13.95 − 14.56 − 2.5`, and the one end-to-end sanity check on the chain.
- [x] Add the test `a one-magnitude difference in apparent K survives as one magnitude absolute` — the map is affine, so a bug that clamps, saturates or rescales the range fails here. (Asserting "the table spans ~8 magnitudes" would instead restate the authored `kMag` column, since an affine map preserves spread identically.)
- [x] Add the test `a brighter S-star comes out hotter and larger` — the monotonicity `sStarAppearance` exists to provide, and what makes the brightness spread in the visual pass read. (Asserting "early and late map to distinct temperatures" would restate two rows of the lookup table.)
- [x] Implement.
- [x] `npm test -- absMagFromGalacticCentreK` → passes.
- [x] Commit.

---

### Task 5: The `sStar` maker

**Files:**

- Create: `src/data/bodies/makers/sStar.ts`
- Test: `tests/data/bodies/makers/sStar.test.ts`

**Interfaces — Produces:**

```ts
export function sStar(row: SStarSeed): OrbitalElements;
//   focusId: 'sgr-a-star'
//   semiMajorMpc: row.semiMajorArcsec * GC_ARCSEC_TO_MPC
//   ascendingNodeRad: skyPositionAngleToFrameAngle(row.ascendingNodeDeg)
//   inclinationRad: skyInclinationToFrameInclination(row.inclinationDeg)   // NOT degToRad(i)
//   argPeriapsisRad: degToRad(row.argPeriapsisDeg)                          // unchanged by the frame swap
//   meanAnomalyRad: meanAnomalyAtJ2000(row.periapsisEpochYr, row.periodYr)
//   meanAnomalyRateRadPerCty: (2 * Math.PI * 100) / row.periodYr
//   plane: GALACTIC_CENTRE_SKY_FRAME
```

Lives in `makers/` beside `satellite.ts`, which it mirrors: a maker that converts a transcribed published table line into the canonical element shape.

`GC_ARCSEC_TO_MPC` is authored through `SCALE_UNITS`, not as a buried literal.

**`inclinationDeg` must not pass straight through `degToRad`.** Both of Task 3's conversions apply here, and the inclination one is the easy omission — see the Task 3 table. `ω` genuinely is untouched, which is what makes the omission look consistent.

The propagator learns nothing new — the per-century rate convention carries mean motion forward, so the same linear affine map that moves a planet moves an S-star.

- [x] Add the test `S2's semi-major axis converts to 1026 AU` — hand-computed `0.1255 × 8178`.
- [x] Add the test `a face-on prograde orbit starts due North and moves East` — build a synthetic seed `(i, Ω, ω) = (0, 0, 0)`, run `keplerianEllipse`, and assert the returned vectors' projections onto the frame basis: `semiMajorMpc · yAxis > 0` (P̂ = North) and `semiMinorMpc · xAxis > 0` (Q̂ = East). `keplerianEllipse` returns **world** vectors (`keplerianEllipse.ts:100-110`), so the assertion must dot against `GALACTIC_CENTRE_SKY_FRAME`'s axes, not read components. The expected orientation comes from the Thiele-Innes convention, not from our own maker, so this is the **unit-level mirror gate**: with the inclination flip dropped, `Q̂` lands on **−x** (West) while `P̂` is unchanged, so the semi-minor sign is the one bit that discriminates.
- [x] Add the test `every S-star focuses on sgr-a-star`.
- [x] Implement.
- [x] `npm test -- sStar` → passes.
- [x] Commit.

**Deliberately not written here:** `the mean-motion rate reproduces the tabulated period`. Propagating by exactly `P` advances `M` by `(2π·100/P)·(P/100) = 2π` — the rate formula restated on both sides of the assertion, which is the `period = 2π/n` mirror the Global Constraints already exclude.

---

### Task 6: The astrometric fixture test — the acceptance gate

**Files:**

- Create: `tests/fixtures/sStarAstrometry.ts`
- Create: `tests/data/bodies/sStarAstrometry.test.ts`

**This task decides whether the feature is correct.** `J/ApJ/837/30/table5` holds the **observed** positional data behind the fits — an external oracle, unlike anything derived from our own maker.

Query the table, inspect its actual column schema before assuming it, and record the schema in the fixture's header. Extract observations for **three stars chosen for discriminating power**:

1. **S2** — best-measured, 16 yr period, many epochs.
2. One with **i < 90°**.
3. One with **i > 90°**.

The inclination pair is what makes a mirror error fail rather than pass. A fixture of same-sense stars would go green against the exact bug this task exists to catch.

Propagate each star to its observation epochs, project to sky offsets (ΔRA·cos δ, ΔDec) relative to Sgr A\*, and assert against the measured values within the quoted uncertainties.

- [x] Query `table5`; record its column schema; build the fixture with provenance.
- [x] Add the test `S2 reproduces its observed sky positions across epochs`.
- [x] Add the test `a prograde and a retrograde star both reproduce their observed positions` — **the mirror gate**.
- [x] Run. If it fails, mutation-check first: confirm the failure is a systematic reflection rather than a unit slip, then apply the Task 3 fallback and document the convention as empirical.
- [x] `npm test -- sStarAstrometry` → passes.
- [x] Commit.

---

### Task 7: Sgr A\* as a labelled, focusable anchor

**Files:**

- Modify: `src/data/bodies/sceneAnchors.ts` (Plan 01 Task 1)
- Create: `src/data/sources/sgr-a-star.ts`
- Modify: `src/@types/data/body/BodyId.d.ts`, the settings body items, `src/data/sourceEntries.ts`
- Modify: `src/data/bodies/sceneBodies.ts` — the membership four separate consumers key on (below)
- Modify: `src/services/engine/presentation/captionPriority.ts`, `src/services/engine/presentation/captionFadeRules.ts`, `src/services/engine/presentation/sceneBodyLabels.ts` — the caption production path
- Modify: `src/services/engine/helpers/resolvePickTable.ts` (`PICK_SEEDS_BY_BODY_ID`)
- Create: `src/data/bodies/sgrAStarSchwarzschildRadiusKm.ts` (one const, following `solarRadiusKm.ts`)
- Test: `tests/data/sources/sgrAStar.test.ts`, `tests/services/engine/presentation/sceneBodyLabels.test.ts`, `tests/services/engine/frame/foregroundMaxDistance.test.ts` (extend — see the landmine below; do **not** edit the properties Plan 02 Task 6 put there)

Sgr A\* is an `AnchorBody` at `raDecDistToCartesian(266.41684, -29.00781, 8178 pc)`, and a source entry with `type: 'body'` and `bearsLabel: true`.

**It draws nothing** in v1 — no sphere, no point, no glint. It is positioned, labelled, focusable, and pickable. Its InfoCard `radiusKm` is the Schwarzschild radius, 12.69 × 10⁶ km, which is a real and citable number rather than a placeholder. That value gets its own one-const module because Task 11 divides the S-star pericentres by it — two sites, one literal.

**"Needs no new machinery" is true of exactly one seam and false of four others.** The settings home genuinely is free — `LABEL_HOME_BY_SOURCE_TYPE`'s `body` row (`labelHomeBySourceType.ts:54-57`) reads `homes.bodies[id].labelEnabled`, and `SOURCE_TYPE_BY_LABEL_CATEGORY` (`sourceTypeByLabelCategory.ts:29-34`) derives from `SOURCE_ENTRIES` automatically. Everything below does not:

| seam                      | site                         | what it needs                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| caption tier              | `captionPriority.ts:38`      | `CaptionKind` gains a member; `CAPTION_PRIORITY` and `CAPTION_FADE_RULES` are `satisfies Record<CaptionKind, …>`, so both fail the build until they have rows. Riding `'star'` is wrong: that row's `labelEnabled`/`subjectVisible` read `starCatalogs.items.famousStar` (`captionFadeRules.ts:104-113`), so Sgr A\*'s name would vanish with the famous-star toggle. |
| caption emission          | `sceneBodyLabels.ts:170-187` | The function emits `SCENE_EARTH + SCENE_STARS + SCENE_PLANETS` only. Sgr A\* draws nothing, so a caption is its **entire** on-screen presence — if it is not emitted here it is invisible, no error.                                                                                                                                                                  |
| pick decode               | `resolvePickTable.ts:34-38`  | `PICK_SEEDS_BY_BODY_ID` is a **total** `Record<BodyId, …>`; adding `'sgr-a-star'` to `BodyId` is a compile error until it names its seed array.                                                                                                                                                                                                                       |
| identity / focus / search | `sceneBodies.ts:15`          | `SCENE_BODIES` gates `#focus=body-<id>` decode (`resolveFocusId.ts:137-143`, returns `null` for an unknown seed) and ref→row materialisation (`extractSelectionRow.ts:49-57`). Not in `SCENE_BODIES` ⇒ not focusable, not selectable, and — see Task 8 — not searchable.                                                                                              |

Note the plan text this replaces claimed the caption "needs no new machinery"; it needs a `CaptionKind` and an emission site. The `CaptionKind`-is-a-shadow-registry backlog item (`docs/backlog/2026-07-29-caption-kind-shadow-registry.md`) predicts exactly this addition — do **not** fold it into that refactor here; add the row and leave the item standing.

**Landmine — Sgr A\* would have auto-inflated the NEAR0 far plane, and Plan 02 Task 6 is what stops it.** The old derivation (`foregroundMaxDistance.ts:89-99`, `:126`) maxed each body's **distance from the render origin** and multiplied by 100. Plan 01 Task 4 seeds `SCENE_ANCHORS` into `deriveBodyStates`, so the instant Sgr A\* becomes a positioned anchor that max would move off Eta Carinae (2.3 × 10⁻³ Mpc) onto Sgr A\* (8.178 × 10⁻³ Mpc) and the gate would go **0.23 → 0.82 Mpc**, violating the coupling the module records at `:63-68` (the gate is the FULL edge of `surveyDeepZoom` and must stay under `MILKY_WAY_LABEL_NEAR_MPC = 0.6`, `milkyWayLabelVisibility.ts:16`, or the "You are here" label never reaches full alpha in the Local Group). Being _positioned_ is enough — Sgr A\* need not be drawn or be a region member.

**Plan 02 Task 6 already removed the mechanism**: the gate is now `max over BODY_REGIONS (region.extentMpc) × MARGIN`, with no `|anchorPos|` term. A region's extent does not grow because its anchor is 8 kpc away, so seeding Sgr A\* moves nothing. Nothing to build here — but this task is where the old formula would have fired, so **the regression test lives here**.

**A second mechanism reached the same gate: region MEMBERSHIP.** `solar-neighbourhood` is the residual region — every anchor no tighter region claims — so seeding Sgr A\* would have swept it in there, taking that region's extent 2.3 × 10⁻³ → 8.178 × 10⁻³ Mpc and the gate to the same 0.82 Mpc, with no `|anchorPos|` term involved. Fixed at the source in `bodyRegions.ts`: anchor membership is now uniform (an anchor is a member of the region it anchors, via `anchoredMemberIds`) and the residual subtracts every anchored region. The checkbox below remains the regression test, now with **two** mechanisms to keep dead — its mutation check must confirm the test goes red if either the `|anchorPos|` term or the non-uniform membership rule is reintroduced.

**Do not build a per-region foreground predicate, and do not widen the gate.** Both were in earlier drafts of this plan and both are wrong for the same reason: every consumer compares the gate against `ctx.cam.distance`, the camera's distance from its **orbit target** (`assembleOrbitCamera.ts:57`: `position = target + distance · dir`), not from the origin. A camera orbiting Sgr A\* from 1 pc away reads `cam.distance = 1 pc`, which clears the unchanged 0.23 Mpc gate on the first frame. The far plane needs no galactic-centre story at all. (The separate `< 1 Mpc` property at `:53-55` was never in danger either.)

What _does_ need a region is S-star **content** gating — the trails' reach cull and the point backdrop's fade band, both keyed on `regionRelativeDistanceMpc` by Plan 02 Tasks 3–5. That is Task 10's business, not the far plane's.

`tests/services/engine/frame/foregroundMaxDistance.test.ts` needs **no** edit in this task: Plan 02 Task 6 already replaced its enclosure-over-absolute-positions assertion (a tautology that would have turned into a false assertion here) with the `< 1 Mpc` and `< MILKY_WAY_LABEL_NEAR_MPC` properties. Both must stay green with Sgr A\* in `SCENE_BODIES`; if either goes red, the derivation regressed — do not adjust the test.

- [x] Add the test `Sgr A* is focusable and labelled but contributes no draw record`.
- [x] Add the test `Sgr A*'s position matches its catalogue RA/Dec/distance` — assert the distance from the origin is 8178 pc and the direction round-trips to RA 266.41684 / Dec −29.00781.
- [x] Add the test `Sgr A*'s caption survives muting the famous-star catalog` — the specific mis-wiring that riding the `'star'` caption kind produces.
- [x] Add the test `seeding Sgr A* does not move the NEAR0 far plane` — assert `FOREGROUND_MAX_DISTANCE_MPC` still sits below `MILKY_WAY_LABEL_NEAR_MPC` with Sgr A\* in the anchor table. Mutation-check it: restore the `|anchorPos| + extentMpc` formula and confirm this test, and only this test, goes red.
- [x] Implement.
- [x] `npm test` → green, `foregroundMaxDistance.test.ts` included and unedited.
- [x] Commit.

---

### Task 8: Sgr A\* in the search box, and the palette's category chip

**Files:**

- Create: `src/utils/scene/constellationOfBody.ts` (one function — the `'None'` sentinel gets one home)
- Create: `src/components/CommandPalette/utils/bodyRowChip.ts`
- Create: `src/data/bodies/bodySearchNames.ts` (the widened per-body alias lookup + Sgr A\*'s row)
- Modify: `src/components/CommandPalette/utils/rankPaletteMatches.ts:96-98` (`FAMOUS_STAR_SEARCH.get(body.id)` → `BODY_SEARCH_NAMES.get(body.id) ?? [body.label]`)
- Modify: `src/components/CommandPalette/paletteRows.tsx:110-111,124` (aliases read the widened lookup; the `'Solar System'` fallback becomes a `bodyRowChip` call) and its explaining comment at `:102-107`
- Modify: `src/components/InfoCard/CompactBodyCard/CompactBodyCard.tsx:26,34` (same sentinel, chip suppressed)
- Modify: `docs/BACKLOG.md` — delete the **"Sun constellation chip renders 'None'"** index line (UI & UX section); this task picks that item up. It has no detail file.
- Depends on (Plan 02 Task 2, not edited here): `src/utils/scene/regionOfBody.ts`, `BodyRegion.label` / `.memberIds`, and total region membership
- Test: `tests/utils/scene/constellationOfBody.test.ts`, `tests/components/CommandPalette/utils/bodyRowChip.test.ts`, `tests/components/CommandPalette/utils/rankPaletteMatches.test.ts` (extend the existing `rankPaletteMatches — scene-body rows` block), `tests/services/url/resolveFocusId.test.ts`

**Registration is already done; what is left is presentation.** The palette index is derived and already total over bodies — Task 7's `SCENE_BODIES` membership is the whole registration, and the three claims below are verification, not work. The real work is the alias lookup and the category chip. Confirmed:

- `rankPaletteMatches.ts:95-102` scores **every** `SCENE_BODIES` row against the query. `SCENE_BODIES` is a static import (`rankPaletteMatches.ts:24`), the function is pure, and there is no settings gate, no async index, no engine handle, and no `bearsLabel` check on this path. A body is searchable iff it is in `SCENE_BODIES` and has a non-empty `label`.
- **There is no per-source-type switch anywhere in the search path.** The palette dispatches on `ScoredRow['kind']` (a UI row tag, unrelated to `SourceEntry['type']`), and `kind: 'body'` already exists in all three sites: the row model (`paletteRowModel.ts:41`), the renderer (`paletteRows.tsx:108-128`), and the focus-id encoder (`focusIdForRow.ts:52`). Nothing to add.
- Selection round-trips through `#focus=body-<id>` already: `usePaletteSearch.ts:86-89` → `focusIdForRow.ts:52` → `CommandPaletteContainer.tsx:58-61` (both `requestSelect` and `requestFocus`) → `resolveFocusId.ts:137-143` → `extractSelectionRow.ts:49-57` → `buildFocusable.ts:35`. Every step is generic over body id.

So **do not invent a registration surface.** Two decisions, both now taken.

**Decided — aliases widen the existing per-body name lookup.** A body absent from `FAMOUS_STAR_SEARCH` (`famousStarsIndex.ts:30-38`) is scored on its single `label` only — that is how Earth and the planets work — so with `label = "Sgr A*"` the query `"sagittarius"` finds nothing. Sgr A\* gets `['Sgr A*', 'Sagittarius A*', 'SgrA*']`, and deliberately **not** "Galactic Centre" / "Galactic Center": that name belongs to `docs/backlog/2026-07-30-galactic-center-place-labels.md`, which is already scoped, and claiming it here would collide.

Per-body alias lists are an **existing seam**: `rankPaletteMatches.ts:95-102` scores over `FAMOUS_STAR_SEARCH.get(body.id)`'s names and falls back to `[body.label]`. That map has exactly one contributor today. Sgr A\* is the second, which by simplicity #7 ("the second special case is the consolidation trigger") means widening the lookup, not branching on it.

```ts
// src/data/bodies/bodySearchNames.ts — the ONE per-body search-name lookup.
export const BODY_SEARCH_NAMES: ReadonlyMap<string, readonly string[]>;
//   contributors: FAMOUS_STARS_GENERATED's names[], plus an authored table of
//   alias rows for bodies with no famous-star row. names[0] is the display label.
```

`rankPaletteMatches.ts:96-98` reads `BODY_SEARCH_NAMES.get(body.id) ?? [body.label]`; `paletteRows.tsx:110-111`'s secondary-alias slot reads the same map, so a widened row _shows_ its aliases as well as matching on them, from one source. `FAMOUS_STAR_SEARCH` stays as the constellation index. **Do not hand-maintain two maps**, and do not add a row to `data/seeds/famous_stars.seed.json` — `SCENE_STARS` and `FAMOUS_STAR_SEARCH` both derive from `FAMOUS_STARS_GENERATED` (`sceneStars.ts:26`, `famousStarsIndex.ts:30-38`), so a seed row would make Sgr A\* a **drawn** famous star, contradicting "draws nothing" and pushing the solar-neighbourhood extent to 8178 pc.

**Decided — the chip is the constellation when the body has one, the region label otherwise** (spec, _The palette's category chip derives from the region_). `paletteRows.tsx:124` reads `star ? star.constellation : 'Solar System'`. That fallback is true for Earth, the planets and the moons, and flatly false for Sgr A\* — worse in Task 9, when 39 stars 8 kpc away would each claim to be in the solar system.

**Famous stars are not mislabelled today and must not be routed through the region.** Every `SCENE_STARS` row comes from `FAMOUS_STARS_GENERATED` (`sceneStars.ts:26`, `famousStarsIndex.ts:30-38`), so all of them already resolve a constellation. Folding them into the region path would trade `'Canis Major'` for `'Solar Neighbourhood'` — a regression, not a fix.

The Sun is the one existing body whose chip changes, and it is a **standing backlog item** ("Sun constellation chip renders 'None'", `ready`, UI & UX) that this task picks up and deletes in the same commit. Its generated row carries `constellation: 'None'` (`famousStars.generated.ts:12`) — the seed table's sentinel for "in no constellation" — so its chip reads "None". Two sites read that sentinel, so it gets one home:

```ts
// src/utils/scene/constellationOfBody.ts — new, one function.
export function constellationOfBody(bodyId: string): string | undefined; // 'None' ⇒ undefined

// src/components/CommandPalette/utils/bodyRowChip.ts — new, one function.
export function bodyRowChip(bodyId: string): string | undefined;
//   constellationOfBody(bodyId) ?? regionOfBody(bodyId)?.label
```

`CompactBodyCard.tsx:26,34` is the second site: its _miss_ path renders nothing, but the Sun is a **hit** with the sentinel, so it prints "None" exactly as the palette does. It carries no region row, so it just reads `constellationOfBody` and drops the chip when it is `undefined` — which is the backlog item's own prescribed fix.

`ROW_VIEW.body` returns a `ReactNode` tree, so `bodyRowChip` has to leave the JSX to be assertable at all; that is the only reason it is a helper rather than an inline expression.

**Plan 02 supplies `regionOfBody`, `BodyRegion.label` / `.memberIds`, and total-and-disjoint membership** (its Task 2) — do not reconstruct any of it here. Totality is what makes `bodyRowChip` a replacement for the `'Solar System'` literal rather than a third branch beside it: every `SCENE_BODIES` row resolves a region, with the Sun in `solar-system` and Sgr A\* in `galactic-centre`. A body in no region would yield an `undefined` chip silently, which is why the totality test lives in Plan 02 and the chip test below re-checks it end to end.

Empty-query browse (`rankPaletteMatches.ts:73-76`) shows the famous atlas + Milky Way only; bodies appear once the user types. That is existing design, not a gap.

- [x] Add the test `Sgr A* is findable by its Sagittarius alias` — the widening's payoff; `"sagittarius"` scores the Sgr A\* row, which label-only matching cannot.
- [x] Add the test `a famous star still matches on its Bayer alias` — the existing behaviour the widened lookup must carry over; asserts `"Alpha Canis Majoris"` finds `'sirius'`.
- [x] Add the test `the Sgr A* palette row resolves to a body focus id` asserting `focusIdForRow` → `body-sgr-a-star` and `resolveFocusId('body-sgr-a-star')` → a non-null body ref. The decoder returns `null` for any id absent from `SCENE_BODIES` (`resolveFocusId.ts:141`), so this is the test that would have caught Task 7's registration gap.
- [x] Add the test `Sgr A*'s palette chip reads Galactic Centre, not Solar System` — the false-label fix.
- [x] Add the test `a famous star keeps its constellation chip` — the branch the region path could clobber; asserts `'sirius'` → `'Canis Major'`.
- [x] Add the test `the Sun's None sentinel routes it to its region` — asserts `'sun'` → `'Solar System'`, not `'None'`.
- [x] Add the test `every scene body resolves a chip` — end-to-end over `SCENE_BODIES`; fails by yielding `undefined`, never by throwing.
- [x] Extract `constellationOfBody` and `bodyRowChip`; repoint `paletteRows.tsx:124` and `CompactBodyCard.tsx:34`.
- [x] Build `BODY_SEARCH_NAMES` with Sgr A\*'s row; repoint `rankPaletteMatches.ts:96-98` and `paletteRows.tsx:110-111`.
- [x] Delete the "Sun constellation chip renders 'None'" line from `docs/BACKLOG.md` in this commit.
- [x] `npm test -- constellationOfBody bodyRowChip rankPaletteMatches resolveFocusId` → passes.
- [x] Commit.

---

### Task 9: S-star source entry and visibility registration

**Files:**

- Create: `src/data/bodies/sceneSStars.ts`
- Create: `src/data/sources/s-star.ts`
- Modify: `src/data/sourceEntries.ts`, the settings slice, `FADE_LAYERS`, `LAYER_GROUPS`
- Modify: `src/services/engine/data/createEngineData.ts:29` (`bodies.setStars`), `src/services/engine/frame/visibleStars.ts`
- Modify: `src/data/bodies/sceneBodies.ts:15`, `src/services/engine/helpers/resolvePickTable.ts:34-38`
- Test: `tests/data/bodies/sceneSStars.test.ts`, `tests/data/sources/sStarSource.test.ts`

**Interfaces — Produces:**

```ts
export const SCENE_S_STARS: readonly StarBody[]; // 39 drawn records
```

This is where the S-stars become _drawn_ content. `SCENE_S_STARS` composes each seed's identity with Task 4's derived `temperatureK` / `absMag` / `radiusSolar`. After Plan 01 Task 6 a `StarBody` carries no position, so these records need nothing else — the star layers read position from the snapshot, which Task 10 populates.

**Four seams, and the drawn one is not where the earlier draft of this plan pointed.** The star layers do **not** iterate `SCENE_STARS`; they iterate `visibleStars(state)`, which filters `state.data.bodies.stars` (`visibleStars.ts:44-52`). `SCENE_STARS` appears in those layers only as the _pick-index_ table (`starPointsLayer.ts:250`, `starSpheresLayer.ts:164`, both `seedIndexOfBody(star.id, SCENE_STARS)`). So:

| what             | where                                                                                           | change                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the drawn set    | `createEngineData.ts:29` seeds `bodies.setStars(SCENE_STARS)`; `visibleStars.ts:46-51` gates it | the store must carry the S-stars, and `visibleStars` must gate them on the new row rather than `famousStar`                                                                                                                                                                                                                                                                |
| pick ids         | `starPointsLayer.ts:250`, `starSpheresLayer.ts:164`                                             | **keep the two seed tables distinct** — the packed id is a _stable index into one table_, so merging would renumber every existing famous star                                                                                                                                                                                                                             |
| pick decode      | `resolvePickTable.ts:34-38`                                                                     | `PICK_SEEDS_BY_BODY_ID` is total over `BodyId`; the new row must name `SCENE_S_STARS`. The star arm at `:75-80` indexes `SCENE_STARS` — an S-star pick must not route there                                                                                                                                                                                                |
| InfoCard / focus | `sceneBodies.ts:15`                                                                             | **`SCENE_BODIES` must gain `...SCENE_S_STARS`.** `extractSelectionRow.ts:49-51` does `SCENE_BODIES.find(b => b.id === ref.id)` and returns `null` on a miss, so without this a picked S-star produces _no card_ — silently. This is what the spec's Q9 claim ("`buildFocusable.ts:35` is pure growth") actually depends on, and it is also what makes Task 8's search work |

`type: 'body'`, `bearsLabel: false`. **Not** `'starCatalog'`: S-stars are element-positioned bodies exactly as planets are, and `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` documents the registry-versus-data disagreement that choosing `'starCatalog'` would duplicate.

Two open backlog items warn this is where registration gets missed — the `LAYER_GROUPS.labels` totality line in `docs/BACKLOG.md:48` (no detail file), and `docs/backlog/2026-07-29-unread-caption-fade-handles.md`. So:

- [x] Add the test `the s-star layer is reachable from its LAYER_GROUPS aggregate` — the totality the backlog item says was near-missed twice.
- [x] Add the test `the s-star fade handle is actually read by its layer` — the defect the other item names. Note that item's finding: for _label_ layers today the handle is registered and never read, so assert the read, not the registration.
- [x] Add the test `s-stars toggle independently of famous stars`.
- [x] Add the test `picking an S-star materialises an InfoCard row` — the `SCENE_BODIES` membership above; it fails with a silent `null`, not an error.
- [x] Add the test `S2 is findable by name in the command palette` — the free consequence of that same membership (Task 8 established the derivation), and the check that 39 new rows don't swamp unrelated queries.
- [x] Add the test `an S-star pick id does not collide with a famous-star pick id` — the two-table stability the pick path rests on.
- [x] Implement.
- [x] `npm test` → green.
- [x] Commit.

---

### Task 10: Wire the rows in and populate the region

**Files:**

- Modify: `src/data/bodies/orbitalElements.ts` (concatenate `sStarElements`)
- Modify: `src/data/bodies/bodyRegions.ts` (`galactic-centre` gains its members)
- Test: `tests/services/engine/frame/deriveBodyStates.test.ts`

The `galactic-centre` region was created empty in Plan 02 Task 2 (`memberIds: []`, `extentMpc: 0`); it now gains Sgr A\* plus the 39 S-stars and derives a real extent from their apoapses. **That extent is the max over all 39, and it is not S2's.** S2's apoapsis is 1934 AU (0.0094 pc), ~35× smaller than the true figure. S85 has both the widest orbit (`a = 4.6″`) and the longest period (3580 yr) in the table, and its apoapsis (`a(1+e)`, `e = 0.78`) is **0.325 pc** — one and a half decades further out than S2's. Take that figure from the transcribed table (Task 1), and never size the region on S2.

Element count goes 23 → 62, crossing the old `MAX_ORBITS = 24` — which Plan 01 Task 7 already made dynamic. If anything truncates here, that plan's work regressed.

**The NEAR0 far plane is not affected by this task, and was not affected by Task 7 either** — Plan 02 Task 6 derives it from region _extents_ with no anchor position, so a 0.325 pc `galactic-centre` extent is nowhere near `solar-neighbourhood`'s 2300 pc and the global max does not move. Do not re-litigate it; Task 7 carries the one regression test.

What the populated region _does_ drive is content gating: the trails' reach cull and the star-point backdrop band, both keyed on `regionRelativeDistanceMpc` against Sgr A\* (Plan 02 Tasks 3–5).

- [x] Add the test `every element row derives a body state` — assert against `ORBITAL_ELEMENTS.length`, not a literal `62`, so it stays a truncation check rather than a count restatement.
- [x] Add the test `the galactic-centre region extent covers the widest S-star orbit` — the widest, not S2's; a region sized on S2 fails it by a factor of ~30.
- [x] Add the test `S-star trails are gated off when the camera is in the solar system` — the payoff of Plan 02, and the regression `MAX_ORBIT_EXTENT_MPC` would have caused.
- [x] Add the test `a Galactic-Centre camera keys the region at parsec scale, not 8 kpc` — `regionRelativeDistanceMpc` against a now-resolvable Sgr A\* anchor; Plan 02 Task 3 could only assert this against a synthetic region.
- [x] Implement.
- [x] `npm test` → green. `npm run build` → clean.
- [x] Commit.

---

### Task 11: Orbital rows on the S-star InfoCard

**Files:**

- Create: `src/@types/engine/BodyOrbitInfo.d.ts`
- Create: `src/utils/orbit/pericentreSpeedKmS.ts`
- Create: `src/data/bodies/sStarOrbitInfo.ts`
- Modify: `src/@types/engine/BodyInfo.d.ts` (one optional field + its header rationale)
- Modify: `src/services/engine/helpers/buildFocusable.ts` (the `body` arm, `:35`)
- Modify: `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx` (the `!isFamousStar` branch, `:124-202`)
- Test: `tests/utils/orbit/pericentreSpeedKmS.test.ts` (new), `tests/components/InfoCard/BodyDetailCard.test.tsx` (exists — extend it)

**Interfaces — Produces:**

```ts
// src/@types/engine/BodyOrbitInfo.d.ts — one type per file.
export type BodyOrbitInfo = {
  readonly focusLabel: string; // 'Sgr A*'
  readonly periodYr: number;
  readonly eccentricity: number;
  readonly pericentreAu: number;
  readonly pericentreSchwarzschildRadii: number;
  readonly pericentreSpeedKmS: number;
};

// src/@types/engine/BodyInfo.d.ts — delta only:
//   + readonly orbit?: BodyOrbitInfo;

export function pericentreSpeedKmS(
  semiMajorAu: number,
  eccentricity: number,
  periodYr: number,
): number;
export function sStarOrbitInfo(bodyId: string): BodyOrbitInfo | undefined;
```

Task 12's visual pass asks for these rows and nothing before this task budgets them. `BodyInfo` today is `type`/`id`/`label`/`positionMpc`/`radiusKm` (`BodyInfo.d.ts:25-31`); the richer rows come from the async `FamousStarMetaEntry` sidecar, which is a famous-star shape with no S-star entries.

**An optional field on `BodyInfo`, not a sidecar.** The type's own header (`BodyInfo.d.ts:7-17`) restricts it to what the engine knows **synchronously** from the resolved body, routing anything needing a fetch to the sidecar. `S_STAR_SEEDS` is static TS, compiled in — so orbital rows _satisfy_ that rule rather than bending it. No JSON, no build artefact, no loading state. Update the header to say so; leaving it claiming "position + radius only" would make the next reader treat this as a violation.

`pericentreSchwarzschildRadii` carries the pericentre in R*s alongside AU, as the spec's Contracts block specifies. It divides `pericentreAu` by `SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM` (Task 7) through `SCALE_UNITS`; a division at the call site, not its own helper. The card rows are spelled `pericentre*`throughout;`periapsis*` stays reserved for the orbital \_elements* (`OrbitalElements.argPeriapsisRad`, `SStarSeed.argPeriapsisDeg`/`.periapsisEpochYr`), which is the existing vocabulary.

**The store row is untouched.** `SelectionRow`'s body arm stays `id`/`label`/`positionMpc`/`radiusKm` and `extractSelectionRow` is not edited. `buildFocusable`'s body arm (`buildFocusable.ts:35`) fills `orbit` by static lookup on `row.id` — that function is already pure over static imports and says so in its header, so a compiled-in seed lookup is exactly its shape. This keeps five derived numbers out of RTK state, where they would be re-serialized on every selection for no gain.

The field is optional because it is genuinely absent for Earth, the planets and the famous stars, all of which keep rendering as they do now. `BodyDetailCard` already drops absent rows entirely (its header, `:36-39`), so the new block is one `{target.orbit && …}` inside the existing `!isFamousStar` branch. An S-star is not in `FAMOUS_STAR_IDS`, so it takes that branch (`:92,98`) and finds no `BODY_FACTS` entry: today's lean panel (Radius, Distance) plus the orbital block.

**The one derived number that earns a `src/utils/` file.** `periodYr` and `eccentricity` come straight off the seed and `pericentreAu` is `a(1 − e)`. The speed does not:

```
v_peri = (2πa / P) · √((1+e)/(1−e))
```

Kepler's third law already ties `GM` to the star's own `a` and `P`, so vis-viva collapses to a form needing no central mass and no new constant. Nothing in `src/utils/orbit/` or `src/utils/astro/` computes an orbital speed today (checked: `keplerianEllipse`, `propagateElements`, `eccentricAnomalyFromMean`, `moonRates*`, `rotationFromIau`), so this is an extraction, not a near-duplicate. Name the Julian-year length rather than burying it — `rateLadder.ts`'s header states the 365.25 d convention the ephemeris already assumes.

For S2 (`a = 1026 AU`, `e = 0.884`, `P = 16.0 yr`) that gives ~7,700 km/s against a published ~7,650 km/s — the row's own external oracle.

- [x] Add the test `S2's pericentre speed matches the published 7,650 km/s within 2%` — the external oracle, and the one check that catches an inverted `(1+e)/(1−e)`, a wrong AU/yr→km/s factor, or a dropped `2π`.
- [x] Add the test `an eccentric orbit is faster at pericentre than a circular orbit of the same period` — the monotone property; a swapped eccentricity ratio makes it slower.
- [x] Add the test `a planet's InfoCard renders no orbital rows` — the optional field's absent path, which is every pre-existing body.
- [x] Add the test `an S-star's InfoCard renders period, eccentricity and pericentre` — the end-to-end seam, seed table through to rendered rows.
- [x] Implement.
- [x] `npm test -- pericentreSpeedKmS BodyDetailCard` → passes. `npm run typecheck` clean.
- [x] Commit.

**Deliberately not written here:** `S2's pericentre is 119 AU`. The row _is_ `a(1 − e)`, so asserting it restates the implementation — the mirror the Global Constraints exclude. Task 5 already pins the arcsec→AU leg (`a = 1026 AU`) against a hand-computed value, and the speed test above fails on a wrong `e`; between them the pericentre row has no unguarded degree of freedom left.

---

### Task 12: Visual pass and close-out

**Files:**

- Modify: `docs/superpowers/specs/2026-07-30-s-star-orbits-design.md` (record the Ω **and i** outcome: derived, or empirical per the fallback)

Ask the user to look. Specific things to check, in order:

1. Focus Sgr A\*. Thirty-nine ellipses at scattered inclinations, no mirrored-looking cluster.
2. Run the clock at `1 yr/s`, then `10 yr/s`. S2 laps in ~16 s and ~1.6 s. Motion is smooth, the body stays on its own trail.
3. Brightness spread reads — S2 and the bright stars clearly visible, the faint tail dim. **The check is "can I see the bright ones", not "can I see all 39."**
4. Fly back toward the Sun. S-stars and their trails fade out; famous stars and planet trails behave exactly as before.
5. Pick a star. The InfoCard shows its label plus Task 11's rows — period, eccentricity, pericentre in AU and Schwarzschild radii, pericentre speed. For S2: 16.0 yr, 0.884, 119 AU = 1,405 R_s, ~7,700 km/s. Pick a planet too and confirm its card is unchanged.
6. Confirm no S-star captions appear, and that Sgr A\* is labelled.
7. Type "Sagittarius" into the search box; Sgr A\* comes up chipped **Galactic Centre** (not "Solar System"), and selecting it both pins the InfoCard and flies the camera. Type "Sirius" and confirm its chip still reads "Canis Major". Type "Sun" and confirm its chip reads "Solar System", not "None".

- [x] Run `npm run dev` (or reuse the running server) and request the visual pass.
- [x] Record the frame-conversion outcome — both `Ω_frame = 90° − Ω_astro` and `i_frame = 180° − i_astro` — in the spec.
- [x] Run `/feature-done` against all three plans.
- [x] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- The astrometric fixture (Task 6) passes for a prograde **and** a retrograde star.
- The VizieR transcription diff was run and reported zero mismatches.
- **Both** frame conversions are applied — `Ω_frame = 90° − Ω_astro` _and_ `i_frame = 180° − i_astro` — and their status (derived or empirical) is recorded in the spec.
- No S-star captions render; Sgr A\* is labelled; Sgr A\* draws no geometry.
- **Sgr A\* is findable in the search box** — by "Sagittarius" as well as "Sgr", through the one widened `BODY_SEARCH_NAMES` lookup and not a second alias map — and selecting the result pins its InfoCard and flies the camera (`#focus=body-sgr-a-star` round-trips).
- Picking an S-star materialises an InfoCard carrying period, eccentricity, pericentre (AU + R_s) and pericentre speed; a planet's card is unchanged, and `SelectionRow` / RTK state gained no field. S-star pick ids do not collide with famous-star pick ids.
- No palette row claims a false region: Sgr A\* and the S-stars chip as **Galactic Centre**, famous stars keep their constellation, Earth and the planets keep **Solar System**, and the Sun's `'None'` sentinel resolves to **Solar System** instead of "None". `CompactBodyCard` drops the Sun's chip rather than printing "None". The backlog's "Sun constellation chip renders 'None'" line is deleted.
- S-stars toggle independently of the famous stars, and their fade handle is read.
- `FOREGROUND_MAX_DISTANCE_MPC` is **unmoved** by this feature — still one global scalar, still ≈ 0.23 Mpc, still below `MILKY_WAY_LABEL_NEAR_MPC` — and no NEAR0 layer's `enabled()` was edited. `foregroundMaxDistance.test.ts` keeps the properties Plan 02 Task 6 gave it.
- The visual pass is confirmed by the user.
