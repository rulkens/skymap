# S-star orbits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the 39 bound S-stars of the Galactic Center as Keplerian bodies orbiting Sgr A\*, animated by the existing solar-system clock.

**Architecture:** The feature half of [the spec](../specs/2026-07-30-s-star-orbits-design.md). Thirty-nine hand-transcribed element rows in their own file, converted by an `sStar` maker into the same `OrbitalElements` shape the planets use, focused on a Sgr A\* anchor, gated by a `galactic-centre` `BodyRegion`. Sgr A\* draws nothing; it is a positioned, labelled, focusable anchor.

**Tech Stack:** TypeScript, Vitest. No new renderers, no shader changes.

## Global Constraints

- **Depends on Plans 01 and 02.** The anchor focus graph and `BodyRegion` must both exist.
- **Data source:** Gillessen et al. 2017, ApJ 837, 30 — VizieR `J/ApJ/837/30/table3`. **S111 is excluded** (`a = −12.3″`, `e = 1.092`, unbound; `propagateElements` is elliptical-only). 39 rows.
- **1 arcsec = 8178 AU** at the GC distance. Sgr A\* at RA 266.41684, Dec −29.00781, 8178 pc.
- **Authoring discipline, copied from `orbitalElements.ts`:** no buried literals. Every distance is `<human value> * SCALE_UNITS.…`, every angle `degToRad(<deg>)`, and **each row carries its raw Gillessen table line in a comment** so the transcription stays checkable.
- **`type` aliases, never `interface`.** One type per file in `src/@types/`; one exported function per file in `src/utils/`.
- **No S-star captions.** `CAPTION_PRIORITY` is not modified. Only Sgr A\* bears a label.
- **Test what can break.** Do **not** write `pericentre === a(1−e)`, `period === 2π/n`, or body-sits-on-its-own-trail assertions — a mirrored orbit passes all three. See Task 6.
- Read [docs/RENDERER.md](../../RENDERER.md) and [docs/DATA.md](../../DATA.md) first.

---

### Task 1: `SStarSeed` and the 39 transcribed rows

**Files:**
- Create: `src/@types/scene/SStarSeed.d.ts`
- Create: `src/data/bodies/sStarElements.ts`
- Test: `tests/data/bodies/sStarElements.test.ts`

**Interfaces — Produces:**
```ts
export type SStarSeed = {
  readonly id: string;                // 's2'
  readonly label: string;             // 'S2'
  readonly semiMajorArcsec: number;
  readonly eccentricity: number;
  readonly inclinationDeg: number;
  readonly ascendingNodeDeg: number;  // astronomical PA: North through East
  readonly argPeriapsisDeg: number;
  readonly periapsisEpochYr: number;  // fractional year
  readonly periodYr: number;
  readonly kMag: number;              // apparent K
  readonly spectralClass: 'early' | 'late' | 'unknown';
};

export const S_STAR_SEEDS: readonly SStarSeed[]; // 39 rows
```

Rows go in their own file, **not** appended to `orbitalElements.ts`, which is already ~700 lines for 23 rows.

**Transcription is verified once, mechanically.** Write a throwaway script that queries VizieR TAP and diffs every field against the committed table:

```
https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync
  REQUEST=doQuery LANG=ADQL FORMAT=text
  QUERY=SELECT Star, a, e, i, Omega, w, Tp, Per, SpT, Kmag FROM "J/ApJ/837/30/table3"
```

Run it, paste its clean output into the task's commit message, then **delete the script** — it is a one-off check, not standing build machinery.

- [ ] Add the test `the seed table holds 39 bound stars` and `S111 is absent` (naming why in the assertion message).
- [ ] Add the test `every seed has a positive semi-major axis and eccentricity below 1` — the property that makes `propagateElements` applicable.
- [ ] Transcribe the 39 rows with per-row provenance comments.
- [ ] Run the VizieR diff script; confirm zero mismatches; delete the script.
- [ ] `npm test -- sStarElements` → passes.
- [ ] Commit, with the diff output in the message.

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

- [ ] Add the test `a star at pericentre in 2000.0 has mean anomaly zero`.
- [ ] Add the test `S2 at Tp 2002.33 with P 16.0 wraps into [0, 2π)` — asserting the wrap, which a naive negative result fails.
- [ ] Add the test `advancing by exactly one period returns the same anomaly`.
- [ ] Implement.
- [ ] `npm test -- meanAnomalyAtJ2000` → passes.
- [ ] Commit.

---

### Task 3: The Galactic Center sky frame and the Ω conversion

**Files:**
- Modify: `src/data/bodies/orbitPlaneFrames.ts`
- Create: `src/utils/orbit/skyPositionAngleToFrameAngle.ts`
- Test: `tests/utils/orbit/skyPositionAngleToFrameAngle.test.ts`

**Interfaces — Produces:**
```ts
export const GALACTIC_CENTRE_SKY_FRAME: OrbitPlaneFrame; // planeFrameFromPole(266.41684, -29.00781)
export function skyPositionAngleToFrameAngle(omegaAstroDeg: number): number; // radians
```

**This is the highest-risk task in the plan.** The elements are referenced to the plane of the sky at the GC, whose pole is the line of sight to Sgr A\*. `planeFrameFromPole` (`orbitPlaneFrames.ts:58`) yields, for that pole:

```
xAxis  = [-sin α, cos α, 0]        = East    (the East tangent, at any Dec)
yAxis  = normal × xAxis  = r̂ × ê  = North
normal = direction to Sgr A*, i.e. AWAY from the observer
```

Both identities hold analytically (`∂r̂/∂α` normalized is the East tangent; `r̂ × ê = ∂r̂/∂δ = n̂`), so no new frame machinery is needed.

**But the frame measures angles from East toward North, while an astronomical position angle runs North through East — the opposite sense.** So the mapping is `Ω_frame = 90° − Ω_astro`, a *reflection*, which couples to the sign of the inclination and the line-of-sight direction. Inclinations in the table span 24.7° to 171.1°, so both senses are present and **a mirror error produces 39 plausible-looking ellipses that no analytic invariant will catch.**

Write the derivation out in the function's docblock so a reader can check it. Task 6 is the acceptance gate; if the derivation and the observations disagree, the recorded fallback is to enumerate the sign and reference combinations, keep the one that reproduces the astrometry, and document the result *as empirical* rather than presenting it as derived.

- [ ] Add the test `the GC frame's x axis is the East tangent and its y axis is North` — assert against independently computed tangent vectors, not against the function's own output.
- [ ] Add the test `the frame normal points away from the observer`.
- [ ] Add the test `a position angle of 0 (due North) maps to the frame's +y`.
- [ ] Implement both; write the derivation into the docblock.
- [ ] `npm test -- skyPositionAngle orbitPlaneFrames` → passes.
- [ ] Commit.

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
export function sStarAppearance(mK: number, cls: SStarSeed['spectralClass']):
  { temperatureK: number; absMag: number; radiusSolar: number };
```

Distance modulus is 14.56 at 8178 pc. `M_K = kMag − 14.56 − A_KS_GALACTIC_CENTRE`.

| star | K apparent | ⇒ M_K |
| --- | --- | --- |
| brightest in table | 10.0 | −7.1 |
| S2 | 13.95 | −3.1 |
| faintest in table | 18.0 | +0.9 |

S2 landing at −3.1 matches its published B0–2V classification, which sanity-checks the chain end to end — make that the headline test.

`A_KS_GALACTIC_CENTRE` is **one named constant with its source cited in a comment**, never folded into per-row numbers, because it is a modelling choice that shifts all 39 stars together and will be refined later.

- [ ] Add the test `S2's dereddened M_K matches its published B0-2V classification` asserting ≈ −3.1.
- [ ] Add the test `the table spans roughly 8 magnitudes` — the spread is the feature; a bug that collapses it must fail here.
- [ ] Add the test `early and late classes map to distinct temperatures`.
- [ ] Implement.
- [ ] `npm test -- absMagFromGalacticCentreK` → passes.
- [ ] Commit.

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
//   meanAnomalyRad: meanAnomalyAtJ2000(row.periapsisEpochYr, row.periodYr)
//   meanAnomalyRateRadPerCty: (2 * Math.PI * 100) / row.periodYr
//   plane: GALACTIC_CENTRE_SKY_FRAME
```

Lives in `makers/` beside `satellite.ts`, which it mirrors: a maker that converts a transcribed published table line into the canonical element shape.

`GC_ARCSEC_TO_MPC` is authored through `SCALE_UNITS`, not as a buried literal.

The propagator learns nothing new — the per-century rate convention carries mean motion forward, so the same linear affine map that moves a planet moves an S-star.

- [ ] Add the test `S2's semi-major axis converts to 1026 AU`.
- [ ] Add the test `the mean-motion rate reproduces the tabulated period` — a full period of propagation returns the starting anomaly.
- [ ] Add the test `every S-star focuses on sgr-a-star`.
- [ ] Implement.
- [ ] `npm test -- sStar` → passes.
- [ ] Commit.

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

- [ ] Query `table5`; record its column schema; build the fixture with provenance.
- [ ] Add the test `S2 reproduces its observed sky positions across epochs`.
- [ ] Add the test `a prograde and a retrograde star both reproduce their observed positions` — **the mirror gate**.
- [ ] Run. If it fails, mutation-check first: confirm the failure is a systematic reflection rather than a unit slip, then apply the Task 3 fallback and document the convention as empirical.
- [ ] `npm test -- sStarAstrometry` → passes.
- [ ] Commit.

---

### Task 7: Sgr A\* as a labelled anchor

**Files:**
- Modify: `src/data/bodies/sceneAnchors.ts`
- Create: `src/data/sources/sgr-a-star.ts`
- Modify: `src/@types/data/body/BodyId.d.ts`, the settings body items, `src/data/sourceEntries.ts`
- Test: `tests/data/sources/sgrAStar.test.ts`

Sgr A\* is an `AnchorBody` at `raDecDistToCartesian(266.41684, -29.00781, 8178)`, and a source entry with `type: 'body'` and `bearsLabel: true`.

Its caption needs no new machinery: `LABEL_HOME_BY_SOURCE_TYPE` already carries a `body` row reading `homes.bodies[id].labelEnabled`.

**It draws nothing** in v1 — no sphere, no point, no glint. It is positioned, labelled, focusable, and pickable. Its InfoCard `radiusKm` is the Schwarzschild radius, 12.69 × 10⁶ km, which is a real and citable number rather than a placeholder.

- [ ] Add the test `Sgr A* is focusable and labelled but contributes no draw record`.
- [ ] Add the test `Sgr A*'s position matches its catalogue RA/Dec/distance`.
- [ ] Implement.
- [ ] `npm test` → green.
- [ ] Commit.

---

### Task 8: S-star source entry and visibility registration

**Files:**
- Create: `src/data/bodies/sceneSStars.ts`
- Create: `src/data/sources/s-star.ts`
- Modify: `src/data/sourceEntries.ts`, the settings slice, `FADE_LAYERS`, `LAYER_GROUPS`
- Modify: `src/services/engine/frame/visibleStars.ts` and the star point/sphere layers' seed source
- Test: `tests/data/bodies/sceneSStars.test.ts`, `tests/data/sources/sStarSource.test.ts`

**Interfaces — Produces:**
```ts
export const SCENE_S_STARS: readonly StarBody[]; // 39 drawn records
```

This is where the S-stars become *drawn* content. `SCENE_S_STARS` composes each seed's identity with Task 4's derived `temperatureK` / `absMag` / `radiusSolar`. After Plan 01 Task 6 a `StarBody` carries no position, so these records need nothing else — the star layers read position from the snapshot, which Task 9 populates.

The star point and sphere layers currently iterate `SCENE_STARS` alone (see `starPointsLayer.ts:249` and `starSpheresLayer.ts:164`, both via `seedIndexOfBody(star.id, SCENE_STARS)`). They must also see `SCENE_S_STARS`. **Keep the two seed tables distinct** — the pick path packs a *stable seed index* per table, so merging them would renumber every existing famous star's packed id.

`type: 'body'`, `bearsLabel: false`. **Not** `'starCatalog'`: S-stars are element-positioned bodies exactly as planets are, and `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` documents the registry-versus-data disagreement that choosing `'starCatalog'` would duplicate.

Two open backlog items warn this is where registration gets missed — `LAYER_GROUPS.labels` totality is unchecked, and two label layers registered fade handles nothing reads. So:

- [ ] Add the test `the s-star layer is reachable from its LAYER_GROUPS aggregate` — the totality the backlog item says was near-missed twice.
- [ ] Add the test `the s-star fade handle is actually read by its layer` — the defect the other item names.
- [ ] Add the test `s-stars toggle independently of famous stars`.
- [ ] Implement.
- [ ] `npm test` → green.
- [ ] Commit.

---

### Task 9: Wire the rows in and populate the region

**Files:**
- Modify: `src/data/bodies/orbitalElements.ts` (concatenate `sStarElements`)
- Modify: `src/data/bodies/bodyRegions.ts` (`galactic-centre` gains its members)
- Test: `tests/services/engine/frame/deriveBodyStates.test.ts`

The `galactic-centre` region was created empty in Plan 02 Task 2; it now derives a real extent from the S-star apoapses.

Element count goes 23 → 62, crossing the old `MAX_ORBITS = 24` — which Plan 01 Task 7 already made dynamic. If anything truncates here, that plan's work regressed.

- [ ] Add the test `all 62 orbits derive a body state`.
- [ ] Add the test `the galactic-centre region extent covers the widest S-star orbit`.
- [ ] Add the test `S-star trails are gated off when the camera is in the solar system` — the payoff of Plan 02.
- [ ] Implement.
- [ ] `npm test` → green. `npm run build` → clean.
- [ ] Commit.

---

### Task 10: Visual pass and close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-s-star-orbits-design.md` (record the Ω outcome: derived, or empirical per the fallback)

Ask the user to look. Specific things to check, in order:

1. Focus Sgr A\*. Thirty-nine ellipses at scattered inclinations, no mirrored-looking cluster.
2. Run the clock at `1 yr/s`, then `10 yr/s`. S2 laps in ~16 s and ~1.6 s. Motion is smooth, the body stays on its own trail.
3. Brightness spread reads — S2 and the bright stars clearly visible, the faint tail dim. **The check is "can I see the bright ones", not "can I see all 39."**
4. Fly back toward the Sun. S-stars and their trails fade out; famous stars and planet trails behave exactly as before.
5. Pick a star. InfoCard shows its label, period, eccentricity, and pericentre.
6. Confirm no S-star captions appear, and that Sgr A\* is labelled.

- [ ] Run `npm run dev` (or reuse the running server) and request the visual pass.
- [ ] Record the Ω conversion outcome in the spec.
- [ ] Run `/feature-done` against all three plans.
- [ ] Commit.

---

## Definition of done

- `npm test` green, `npm run typecheck` clean, `npm run build` clean.
- The astrometric fixture (Task 6) passes for a prograde **and** a retrograde star.
- The VizieR transcription diff was run and reported zero mismatches.
- No S-star captions render; Sgr A\* is labelled; Sgr A\* draws no geometry.
- S-stars toggle independently of the famous stars, and their fade handle is read.
- The visual pass is confirmed by the user.
- The Ω conversion's status — derived or empirical — is recorded in the spec.
