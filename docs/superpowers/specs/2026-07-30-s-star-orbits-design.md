# S-star orbits around Sgr A\*

Render the 39 bound S-stars of the Galactic Center as Keplerian bodies orbiting
Sgr A\*, driven by the existing solar-system time control. At the `10 yr/s` clock
detent, S2 completes a lap in 1.6 seconds, sweeping through pericentre at 119 AU
and 7,760 km/s — 2.6% of light speed — on a *measured* orbit.

Design decisions and their rejected alternatives are recorded in
[`docs/grill-sessions/s-star-orbits-2026-07-30.md`](../../grill-sessions/s-star-orbits-2026-07-30.md);
this spec cross-references those as **Q1**–**Q10** rather than restating the
reasoning.

## Goal

A viewer who focuses Sgr A\* sees 39 nested ellipses at scattered inclinations,
picks any star for an InfoCard, and can run the clock to watch the inner stars
orbit. Sgr A\* itself draws nothing in v1 — it is a positioned, labelled,
focusable anchor, and the orbits imply the mass.

## Non-goals

- **No Sgr A\* rendering.** No black disc, no lensing, no photon ring. A dedicated
  visual treatment is a deliberate follow-up (recorded in the transcript preamble).
- **No tour beat, no URL deep link.** Selection and focus only.
- **No resolution of the near-field star domain question.** See
  [Relationship to open items](#relationship-to-open-items).

## Data source

Gillessen et al. 2017, ApJ 837, 30 — VizieR `J/ApJ/837/30/table3`. Forty rows of
classical elements with K magnitude and an early/late flag.

**S111 is excluded.** It carries `a = −12.3″`, `e = 1.092`, and no period: a
genuinely unbound star escaping the Galactic Center. `propagateElements` is
elliptical-only, so hyperbolic support would be a separate feature. 39 rows remain,
of which 30 are early-type, 8 late-type, 2 unclassified.

Scale conversion, with the GC at 8178 pc (GRAVITY): **1 arcsec = 8178 AU**.

| quantity | value |
| --- | --- |
| S2 semi-major axis | 0.1255″ = 1026 AU |
| S2 pericentre | 119 AU = 1404 Schwarzschild radii |
| S2 apoapsis | 1934 AU |
| S2 period | 16.0 yr |
| Sgr A\* Schwarzschild radius | 0.085 AU = 12.69 × 10⁶ km |
| period range across the table | 12.8 yr (S55) to 3580 yr |

Transcription is verified once by a throwaway VizieR TAP diff script whose output
is recorded in the implementation plan, not kept as standing build machinery (Q4).

---

## Ground preparation

Three prep refactors, each its own commit, sequenced before any feature commit.
Packaging: **one PR, prep commits first** (checkpoint decision). Verdicts from the
`refactor-ground` pass, corrected twice during the grill.

### P1 — Focus resolution over a graph of positioned bodies

**Bolt-on.** Two distinct braids, resolved together.

*Braid one:* `parentId === null` is branched on at four sites —
`deriveBodyStates.ts:81` and `:96`, `orbitTrailsLayer.ts:120` and `:227` — and
`sceneOrbitConics.ts` resolves a focus through `elementsById`, which throws on any
id absent from the element table. Sgr A\* is neither a valid `parentId: null` row
nor a resolvable parent, so a fifth branch would be the second special case on one
discriminant.

*Braid two:* `StarBody` carries a static `positionMpc` while `PlanetBody` is
identity-only, its docblock stating that position "live[s] in its `BodyState` …
never baked here". So no drawn star can be element-driven, which is exactly what an
S-star is (Q1).

Prep: every body's position comes from the per-frame state map. Roots of the focus
graph are **anchors** — positioned, non-Keplerian bodies (the Sun, the 119 famous
stars, Sgr A\*). `parentId: null` becomes `focusId: 'sun'` with the Sun explicit,
so the null disappears rather than relocating (Q2). Resolution runs in dependency
order, retiring the documented one-hop / every-parent-is-heliocentric limit.

**Behaviour-neutrality requires one further un-braid.** `liveBodyPosition`
returning non-null is the membership predicate for `followBody.isActive`
(`cameraDrivers.ts:276`), the focus-tween skip (`watchFocusTweenSaga.ts:97`),
`applyFocusedBodyPivot`, and NEAR0 selection-ring centring. Presence in the map
stands in for "this thing moves". Once anchors enter the map that proxy breaks and
119 famous stars would silently become follow-driven. P1 therefore replaces it with
an explicit "moves this frame" predicate (Q3): anchors are positioned but not
followed; Keplerian rows are followed.

Proof obligation: `deriveBodyStates(CONST_J2000)` reproduces today's values
bit-for-bit, the same zero-change proof the original derive carried.

### P2 — Capacity, derived rather than hardcoded

**Bolt-on.** `MAX_ORBITS = 24` (`orbitTrailRenderer.ts:52`) against 23 element rows
today, with a silent `Math.min(ORBITAL_ELEMENTS.length, MAX_ORBITS)` truncation at
`orbitTrailsLayer.ts:181`. 23 + 39 = 62. The sibling `MAX_PLANETS = 24`
(`planetRenderer.ts:61`) has the identical defect and an open backlog item.

The decisive precedent: **`starPointRenderer.ts:209` already grows its buffer
dynamically** when `stars.length > capacityStars`. So one of the three renderers is
already correct, and P2's job is to make the other two match it rather than to
raise a literal.

Scope includes the `MAX_PLANETS` fix by explicit decision, deleting
`docs/backlog/2026-07-29-planet-renderer-max-planets-cap.md` in the same change.
Overflow becomes loud rather than a silent `Math.min`.

`bodyPickRenderer.ts:142` claims `SCENE_STARS.length ~= 25`; it is 119. Stale
comment, benign because spheres resolve nearest-one-at-a-time, but P2 corrects it
rather than inheriting it.

### P3 — `BodyRegion`: scale gating becomes anchor-relative

**Bolt-on, and the largest of the three.** `scaleFadeBands.ts:18` records that
three band rows key on *the camera's distance from the heliocentric render origin*.
For S-stars that value is ~8178 pc wherever you stand at the GC, and the same 8178
pc if you fly 8 kpc the other way. **The current model cannot express "this content
appears when you are near it" for content not near the Sun.** Protecting the
existing bands is therefore insufficient, not merely narrower (Q6).

The second case is already shipped. Three extents exist, one pair duplicating:

| extent | scope | band shape |
| --- | --- | --- |
| `FARTHEST_BODY_MPC` | star seeds | `starBackdrop` ×2 / ×10 |
| `FARTHEST_PLANET_MPC` | planet seeds | `bodyGlintBackdrop` ×2 / ×10 |
| `MAX_ORBIT_EXTENT_MPC` | orbit reach | whole-layer sub-pixel cull |

The first two are two regions with two extents and the identical ×2 / ×10 shape,
hand-written twice, unnoticed because both share the Sun as anchor.

Orbit trails are affected the same way. `orbitTrailsLayer.ts:117` computes a
*heliocentric* reach, so an S-star contributes 8178 pc + 1934 AU and
`MAX_ORBIT_EXTENT_MPC` jumps by ~1.7 × 10⁷. The whole-layer cull then evaluates
`nearestMpc = max(|camPos| − MAX_ORBIT_EXTENT, 0)` to **0 for any camera within 8
kpc of the Sun**, silently defeating the cull for every solar-system trail.

Prep: the region becomes first-class and the keying quantity becomes
anchor-relative, for **every content kind a region owns** — points, spheres,
glints, trails, labels. `FOREGROUND_MAX_DISTANCE_MPC` stays global, because it is
the NEAR0 far plane and must cover everything.

**There are three regions, not two, and a region is not an anchor.** The two
existing extents are both anchored at the Sun but differ by seven orders of
magnitude — `FARTHEST_PLANET_MPC` is Neptune at ~30 AU, `FARTHEST_BODY_MPC` is Eta
Carinae at 2300 pc. A single extent per region cannot serve both, so the solar
system and the stellar neighbourhood are **separate regions that share an anchor**:

| region | anchor | extent today | governs |
| --- | --- | --- | --- |
| `solar-system` | `sun` | ~30 AU (Neptune) | planet glints, planet trails |
| `solar-neighbourhood` | `sun` | 2300 pc (Eta Carinae) | star points, star captions |
| `galactic-centre` | `sgr-a-star` | S-star max apoapsis | S-star points, S-star trails |

That two regions share one anchor is the point: **region is a scale regime, anchor
is a position.** Conflating them is what produced a single global `FARTHEST_*` pair
in the first place. The model therefore has three rows drawn entirely from existing
code, before this feature adds anything.

P1 and P3 compose rather than overlap: P1's focus-graph resolution retires the
one-hop recursion in `maxHeliocentricReachMpc` that P3 re-keys.

---

### Plan decomposition

P1, P2, P3 and the feature are four independently testable bodies of work, and P3
grew past P1 and P2 combined during the grill. This should be **more than one
implementation plan**, sequenced: P1 and P2 can be written as one plan (both are
narrow, both carry zero-change proofs), P3 as its own, and the feature as a third.
All three land as commits on one PR per the packaging decision — separate plans,
one PR, is not a contradiction.

## Architecture

### Contracts

```ts
// src/@types/scene/AnchorBody.d.ts — a positioned, non-Keplerian root of the focus graph.
export type AnchorBody = {
  readonly id: string;
  readonly positionMpc: Vec3; // absolute heliocentric, f64-valued
};

// src/@types/data/BodyRegionId.d.ts
export type BodyRegionId = 'solar-system' | 'solar-neighbourhood' | 'galactic-centre';

// src/@types/scene/BodyRegion.d.ts — a localized group of bodies with its own scale.
export type BodyRegion = {
  readonly id: BodyRegionId;
  readonly anchorId: string;   // the positioned root this region's content orbits
  readonly extentMpc: number;  // DERIVED: max |member − anchor|, never authored
};

// src/@types/scene/SStarSeed.d.ts — one transcribed Gillessen table row.
export type SStarSeed = {
  readonly id: string;              // 's2'
  readonly label: string;           // 'S2'
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

// src/@types/scene/OrbitalElements.d.ts — delta only.
//   - readonly parentId: string | null    ← REMOVED
//   + readonly focusId: string            ← every row names its focus (Q2)
```

### Files

| path | status |
| --- | --- |
| `src/data/bodies/sStarElements.ts` | new — 39 hand-authored rows, inline provenance |
| `src/data/bodies/makers/sStar.ts` | new — `SStarSeed → OrbitalElements` |
| `src/data/bodies/sceneAnchors.ts` | new — Sgr A\* + the Sun + derived famous-star anchors |
| `src/data/bodies/bodyRegions.ts` | new — the three region rows, extents derived |
| `src/@types/data/BodyRegionId.d.ts` | new — one type per file |
| `src/@types/scene/BodyRegion.d.ts` | new — one type per file |
| `src/@types/scene/AnchorBody.d.ts` | new — one type per file |
| `src/@types/scene/SStarSeed.d.ts` | new — one type per file |
| `src/data/sources/s-star.ts` | new — source entry, `type: 'body'`, `bearsLabel: false` |
| `src/data/sources/sgr-a-star.ts` | new — source entry, `type: 'body'`, `bearsLabel: true` |
| `src/utils/orbit/meanAnomalyAtJ2000.ts` | new — one function |
| `src/data/bodies/orbitPlaneFrames.ts` | +1 frame: the GC sky plane |
| `src/data/bodies/orbitalElements.ts` | `focusId` migration; concatenates `sStarElements` |

`sStarElements.ts` is its own file rather than 39 more rows in `orbitalElements.ts`,
which is already ~700 lines for 23 rows (Q4).

### The maker

```ts
export function sStar(row: SStarSeed): OrbitalElements;
//   focusId: 'sgr-a-star'
//   semiMajorMpc: row.semiMajorArcsec * GC_ARCSEC_TO_MPC
//   meanAnomalyRad: meanAnomalyAtJ2000(row.periapsisEpochYr, row.periodYr)
//   meanAnomalyRateRadPerCty: (2 * Math.PI * 100) / row.periodYr
//   plane: GALACTIC_CENTRE_SKY_FRAME
```

`meanAnomalyAtJ2000(TpYr, periodYr)` returns `2π(2000.0 − TpYr) / periodYr`,
wrapped to `[0, 2π)`. The existing per-century rate convention carries mean motion
forward, so the propagator learns nothing new — the same linear affine map that
moves a planet moves an S-star.

---

## The reference frame and the Ω conversion

The Gillessen angles are referenced to the **plane of the sky at the Galactic
Center**, whose pole is the line of sight to Sgr A\*. The existing seam expresses
that with no new machinery:

```
GALACTIC_CENTRE_SKY_FRAME = planeFrameFromPole(266.41684, -29.00781)
  xAxis  = [-sin α, cos α, 0]        = East   (the East tangent, at any Dec)
  yAxis  = normal × xAxis  = r̂ × ê  = North
  normal = direction to Sgr A*, i.e. AWAY from the observer
```

Both identities hold analytically: `∂r̂/∂α` normalized is `[-sin α, cos α, 0]`, and
`r̂ × ê = ∂r̂/∂δ = n̂`.

**The conversion is orientation-reversing, and this is the spec's highest-risk
item.** The frame measures angles from `xAxis` (East) toward `yAxis` (North); an
astronomical position angle runs North through East. So the mapping is

```
Ω_frame = 90° − Ω_astro
```

which is a reflection, and therefore couples to the sign of the inclination and to
the line-of-sight direction. Inclinations in the table span 24.7° to 171.1°, so
both senses are present and **a mirror error will not announce itself** — it
produces 39 plausible-looking ellipses.

The derivation must be written out in `sStar.ts`'s docblock so a reader can check
it, per the transcription discipline `orbitalElements.ts` establishes. If the
derivation and the astrometric fixture disagree, the recorded fallback is to
enumerate the sign and reference combinations, keep the one that reproduces the
observations, and document the empirical result as such (Q5).

---

## Appearance

The table gives apparent K magnitude and an early/late flag; it gives **no per-star
spectral types**. The seed pipeline wants `absMag`, `temperatureK`, `radiusSolar`.

Derivation (Q8): per-star `M_K` from the distance modulus (14.56 at 8178 pc) and a
single named constant `A_KS_GALACTIC_CENTRE ≈ 2.5`, then `(M_K, spectralClass) →
temperature, absMag` through a small table.

| star | K apparent | ⇒ M_K |
| --- | --- | --- |
| brightest in table | 10.0 | −7.1 |
| S2 | 13.95 | −3.1 |
| faintest in table | 18.0 | +0.9 |

S2 landing at −3.1 matches its published B0–2V classification, which sanity-checks
the chain end to end.

Two constraints:

- `A_KS_GALACTIC_CENTRE` is a **modelling choice, not a measurement**, and shifts
  all 39 stars together. It lives as one named constant with its source cited, never
  folded into per-row numbers, so a later refinement is a one-line change.
- The faint tail is genuinely dim (`M_K ≈ +1`). That is correct. The visual check is
  "can I see S2 and the bright ones clearly", not "can I see all 39".

## Registration and visibility

- **S-stars**: `src/data/sources/s-star.ts`, `type: 'body'`, `bearsLabel: false`.
  Their own settings row, fade layer, and `LAYER_GROUPS` membership, so they toggle
  independently of the famous stars (Q7).
- **Sgr A\***: `type: 'body'`, `bearsLabel: true`. Its caption needs no new
  machinery — `LABEL_HOME_BY_SOURCE_TYPE` (landed in #522) already carries a `body`
  row reading `homes.bodies[id].labelEnabled`.
- **No S-star captions.** `CAPTION_PRIORITY` is untouched. Identity comes from pick
  → InfoCard, which is pure growth: `buildFocusable.ts:35` builds a `BodyInfo` for
  every body row generically and `#focus=body-<id>` follows (Q9).

`type: 'body'` rather than `'starCatalog'` is deliberate: S-stars are
element-positioned bodies exactly as planets are, and choosing `'body'` avoids
adding a second instance of the registry-versus-data disagreement that
`2026-07-29-near-field-stars-body-vs-star-domain.md` documents.

## Verification

**The fixture test is the load-bearing check.** `J/ApJ/837/30/table5` holds the
*observed* astrometry behind the fits. Propagate to real observation epochs and
assert sky-projected (ΔRA, ΔDec) against measured values within quoted
uncertainties.

Three stars, chosen for discriminating power, not convenience:

1. **S2** — best-measured, 16 yr period, many epochs.
2. One with **i < 90°**.
3. One with **i > 90°**.

The inclination pair is what makes a mirror error fail rather than pass.

Deliberately **not** written: pericentre equals `a(1−e)`, period matches `2π/n`,
body-sits-on-its-own-trail. Every one of those passes against a mirrored orbit, and
the project's testing convention rejects restatement-of-constants tests.

Prep carries its own obligation: `deriveBodyStates(CONST_J2000)` bit-for-bit
unchanged, and the existing band edges unchanged for the solar-neighbourhood
region.

One visual pass, for what a fixture cannot judge: whether the brightness spread
reads, whether 39 trails clutter, whether the region fade bands feel right. Note in
advance that 39 co-located objects will stress the open "Label declutter toggle +
hysteresis" backlog item if captions are ever added.

## Relationship to open items

`docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` (`needs-grill`)
touches the same files as P1 but a different concern: **identity and domain** — is
the Sun a star or a body, which source code wins a pick, where `famousStarsMeta`
lives. This work changes **position sourcing** only, and the two are orthogonal in
practice: picking keys on `seedIndexOfBody(star.id, SCENE_STARS)`, `visibleStars`
gates on `settings.bodies.items.sun.enabled`, and `Source.Sun` versus
`Source.FamousStar` is untouched either way.

**This spec deliberately does not resolve that item.** Its grill remains available
intact.

Retired by this work: `docs/backlog/2026-07-29-planet-renderer-max-planets-cap.md`,
folded into P2.

Adjacent and untouched: `docs/backlog/2026-07-30-galactic-center-place-labels.md`
(the four remaining POI markers, once Sgr A\* exists as a positioned body).
