# S-star orbits around Sgr A\*

Render the 39 bound S-stars of the Galactic Center as Keplerian bodies orbiting
Sgr A\*, driven by the existing solar-system time control. "S-star" is used
throughout as the collective name for the table's 39 bound rows — two of them,
R34 and R44, carry Gillessen's own R designations rather than S. At the `10 yr/s` clock
detent, S2 completes a lap in 1.6 seconds, sweeping through pericentre at 119 AU
and 7,760 km/s — 2.6% of light speed — on a _measured_ orbit.

Design decisions and their rejected alternatives are recorded in
[`docs/grill-sessions/s-star-orbits-2026-07-30.md`](../../../grill-sessions/s-star-orbits-2026-07-30.md);
this spec cross-references those as **Q1**–**Q10** rather than restating the
reasoning.

## Goal

A viewer who focuses Sgr A\* sees 39 nested ellipses at scattered inclinations,
picks any star for an InfoCard reading its period, eccentricity and pericentre
speed, and can run the clock to watch the inner stars orbit. Sgr A\* itself draws
nothing in v1 — it is a positioned, labelled, focusable anchor, and the orbits
imply the mass.

## Non-goals

- **No Sgr A\* rendering.** No black disc, no lensing, no photon ring. A dedicated
  visual treatment is a deliberate follow-up (recorded in the transcript preamble).
- **No tour beat, and no new URL machinery.** Selection and focus only.
  `#focus=body-<id>` round-trips for the new bodies as a free consequence of
  `SCENE_BODIES` membership; nothing is built for it.
- **No resolution of the near-field star domain question.** See
  [Relationship to open items](#relationship-to-open-items).

## Data source

Gillessen et al. 2017, ApJ 837, 30 — VizieR `J/ApJ/837/30/table3`. Forty rows of
classical elements with K magnitude and an early/late flag.

**S111 is excluded.** It carries `a = −12.3″`, `e = 1.092`, and no period: a
genuinely unbound star escaping the Galactic Center. `propagateElements` is
elliptical-only, so hyperbolic support would be a separate feature. 39 rows remain,
of which 30 are early-type, 7 late-type, 2 unclassified — S111 was itself
late-type, so its exclusion drops the late count to 7, not 8.

Scale conversion, with the GC at 8178 pc (GRAVITY): **1 arcsec = 8178 AU**.

| quantity                      | value                             |
| ----------------------------- | --------------------------------- |
| S2 semi-major axis            | 0.1255″ = 1026 AU                 |
| S2 pericentre                 | 119 AU = 1405 Schwarzschild radii |
| S2 apoapsis                   | 1934 AU                           |
| S2 period                     | 16.0 yr                           |
| Sgr A\* Schwarzschild radius  | 0.085 AU = 12.69 × 10⁶ km         |
| period range across the table | 12.8 yr (S55) to 3580 yr          |

Transcription is verified once by a throwaway VizieR TAP diff script whose output
is recorded in the implementation plan, not kept as standing build machinery (Q4).

---

## Ground preparation

Three prep refactors, each its own commit, sequenced before any feature commit.
Packaging: **one PR, prep commits first** (checkpoint decision). Verdicts from the
`refactor-ground` pass, corrected twice during the grill.

### P1 — Focus resolution over a graph of positioned bodies

**Bolt-on.** Two distinct braids, resolved together.

_Braid one:_ `parentId === null` is branched on at four sites —
`deriveBodyStates.ts:81` and `:96`, `orbitTrailsLayer.ts:120` and `:227` — and
`sceneOrbitConics.ts` resolves a focus through `elementsById`, which throws on any
id absent from the element table. Sgr A\* is neither a valid `parentId: null` row
nor a resolvable parent, so a fifth branch would be the second special case on one
discriminant.

_Braid two:_ `StarBody` carries a static `positionMpc` while `PlanetBody` is
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

**Bolt-on.** `MAX_ORBITS = 24` (`orbitTrailRenderer.ts:52`) against 22 element rows
today, with a silent `Math.min(ORBITAL_ELEMENTS.length, MAX_ORBITS)` truncation at
`orbitTrailsLayer.ts:181`. 22 + 39 = 61. The sibling `MAX_PLANETS = 24`
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
three band rows key on _the camera's distance from the heliocentric render origin_.
For S-stars that value is ~8178 pc wherever you stand at the GC, and the same 8178
pc if you fly 8 kpc the other way. **The current model cannot express "this content
appears when you are near it" for content not near the Sun.** Protecting the
existing bands is therefore insufficient, not merely narrower (Q6).

The second case is already shipped. Three extents exist, one pair duplicating:

| extent                 | scope        | band shape                   |
| ---------------------- | ------------ | ---------------------------- |
| `FARTHEST_BODY_MPC`    | star seeds   | `starBackdrop` ×2 / ×10      |
| `FARTHEST_PLANET_MPC`  | planet seeds | `bodyGlintBackdrop` ×2 / ×10 |
| `MAX_ORBIT_EXTENT_MPC` | orbit reach  | whole-layer sub-pixel cull   |

The first two are two regions with two extents and the identical ×2 / ×10 shape,
hand-written twice, unnoticed because both share the Sun as anchor.

Orbit trails are affected the same way. `orbitTrailsLayer.ts:117` computes a
_heliocentric_ reach, so an S-star contributes 8178 pc + its own apoapsis and
`MAX_ORBIT_EXTENT_MPC` jumps by seven-plus orders of magnitude (from Neptune's ~30
AU to ~8178 pc). The whole-layer cull then evaluates
`nearestMpc = max(|camPos| − MAX_ORBIT_EXTENT, 0)` to **0 for any camera within 8
kpc of the Sun**, silently defeating the cull for every solar-system trail.

Prep: the region becomes first-class, and the keying quantity becomes
anchor-relative **wherever the gated content belongs to a region** — the star-point
backdrop, the body glints, and the orbit-trail reach. It does _not_ become
anchor-relative for scene-wide or observer-relative content (the survey point
clouds' deep-zoom recede, the Milky-Way impostor's approach, the Sun's own caption,
Earth's-sky constellation figures): those genuinely key on the camera's distance
from the origin, and repointing them at a region would be motion for its own sake.

**There are three regions, not two, and a region is not an anchor.** The two
existing extents are both anchored at the Sun but differ by seven orders of
magnitude — `FARTHEST_PLANET_MPC` is Neptune at ~30 AU, `FARTHEST_BODY_MPC` is Eta
Carinae at 2300 pc. A single extent per region cannot serve both, so the solar
system and the stellar neighbourhood are **separate regions that share an anchor**:

| region                | anchor       | members                                | extent today          | governs                      |
| --------------------- | ------------ | -------------------------------------- | --------------------- | ---------------------------- |
| `solar-system`        | `sun`        | the Sun, Earth, the planets, the moons | ~30 AU (Neptune)      | planet glints, planet trails |
| `solar-neighbourhood` | `sun`        | the other 118 famous stars             | 2300 pc (Eta Carinae) | star points, star captions   |
| `galactic-centre`     | `sgr-a-star` | Sgr A\* + the 39 S-stars               | max S-star apoapsis   | S-star points, S-star trails |

That two regions share one anchor is the point: **region is a scale regime, anchor
is a position.** Conflating them is what produced a single global `FARTHEST_*` pair
in the first place. The model therefore has three rows drawn entirely from existing
code, before this feature adds anything. Each row also carries its display name —
"Solar System", "Solar Neighbourhood", "Galactic Centre" — which the command
palette reads (see [the palette chip](#the-palettes-category-chip-derives-from-the-region)).

**Membership is total, and an anchor is a member of its own region.** Every scene
body belongs to exactly one region: the Sun to `solar-system` (not to the
neighbourhood it anchors), Earth to `solar-system`, Sgr A\* to `galactic-centre`.
Totality is what lets the palette chip resolve for every body without a fallback
literal; anything less leaves a body chip-less and silently `undefined`. Extents
are unaffected — the Sun contributes 0 to `solar-system`, and
`solar-neighbourhood` still measures `max |famous star − Sun|` = 2300 pc from its
Sun anchor. `galactic-centre` is genuinely empty until the feature populates it,
so its extent is 0 and it gates its own (absent) content off.

#### `FOREGROUND_MAX_DISTANCE_MPC` stays a global scalar — re-derived, not re-keyed

Two earlier drafts of this spec were wrong about this constant in opposite
directions. It does not stay as it is, and it does not become a per-region
predicate. **The gate threshold is a scale, not a position** — and once that is
said out loud, the fix is a one-line change to the derivation and nothing else.

Every NEAR0 consumer reads the constant as
`ctx.cam.distance >= FOREGROUND_MAX_DISTANCE_MPC`: `atmosphereDrawList.ts:59`,
`bodyGlintsLayer.ts:126,149`, `cloudShellLayer.ts:120`, `earthLayer.ts:83`,
`foregroundLabelsLayer.ts:395`, `orbitTrailsLayer.ts:148`,
`planetsLayer.ts:90,110`, `ringsLayer.ts:135`, `starPointsLayer.ts:108`,
`starSpheresLayer.ts:89`, `texturedBodiesLayer.ts:111`. And `ctx.cam.distance` is
the camera's distance from its **orbit target**, not from the render origin —
`assembleOrbitCamera.ts:57` derives `position = target + distance · dir`. A camera
orbiting Sgr A\* from 1 pc away therefore reads `cam.distance = 1 pc`, which
already clears today's 0.23 Mpc gate. No widening is needed, no per-region
predicate is needed, and no layer is retrofitted.

One consumer differs and is the reason the constant must remain a scalar:
`SCALE_FADE_BANDS.surveyDeepZoom.fullAt` (`scaleFadeBands.ts:66`) uses it as a band
edge, and that band is keyed on the camera's distance from the origin.

The real defect is in the DERIVATION. `FARTHEST_BODY_MPC`
(`foregroundMaxDistance.ts:99`) is a max over **absolute distances from the render
origin** — the `deriveBodyStates(CONST_J2000)` snapshot plus the `SCENE_STARS`
records (`:89-94`) — times `MARGIN = 100` (`:124`, `:126`). P1 puts anchors into
that snapshot, so the moment Sgr A\* becomes an anchor the max moves from Eta
Carinae's 2300 pc (2.3e-3 Mpc) to 8178 pc (8.18e-3 Mpc) and the gate auto-inflates
0.23 → 0.82 Mpc. That breaks the `< MILKY_WAY_LABEL_NEAR_MPC = 0.6 Mpc` coupling
recorded at `:63-68`, without which the origin-anchored "You are here" label never
reaches full alpha in the Local Group. The separate `< 1 Mpc` property at `:53-55`
survives 0.82 untouched — it is not the one that breaks.

So the constant stays **one global scalar** and its derivation is re-keyed to
region EXTENTS:

```
FOREGROUND_MAX_DISTANCE_MPC = max over BODY_REGIONS (region.extentMpc) × MARGIN
```

with **no `|anchorPos|` term**. An earlier draft's
`max over regions(|anchorPos| + extentMpc) × 100` folded an absolute position into
a threshold that is compared against a relative distance — the same category error
as the per-region predicate, one layer down. Dropping it:

- keeps the value at 0.23 Mpc — `solar-neighbourhood`'s 2300 pc dominates, and
  `galactic-centre`'s extent (0.325 pc, set by S85's apoapsis) is negligible —
  so the 0.6 Mpc coupling is preserved by construction, not by re-tuning;
- never resolves `sgr-a-star`'s anchor **position** at all, so the sequencing gap
  (nothing seeds that anchor until the feature plan) does not arise, and no
  extent-0 filter is needed to dodge it;
- retires `FARTHEST_BODY_MPC` and `FARTHEST_PLANET_MPC` into region extents, as P3
  already plans.

The Milky-Way-label constraint therefore attaches to the `solar-neighbourhood`
region's extent rather than riding inside a global constant whose name never said
so — the honest statement of what it always was.

What per-region keying buys is unchanged and lives elsewhere in this prep: the
`starBackdrop` / `bodyGlintBackdrop` fade bands and the orbit-trail reach cull key
on `|camPos − anchorPos|`, which is what lets galactic-centre content appear when
the camera is near **it**. That is P3's core. The far plane is not part of it.

One pre-existing wrinkle is deliberately out of scope: `FOREGROUND_MAX_DISTANCE_MPC`
and `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` are both _derived_ as camera-to-origin
bounds yet _read_ against camera-to-target. Benign while NEAR0 content only exists
near the origin, so focus targets are near the origin too. Filed as its own item:
[`docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`](../../../backlog/2026-07-30-camera-target-vs-origin-distance-gates.md).

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
  readonly label: string; // display copy: 'Solar System' | 'Solar Neighbourhood' | …
  readonly anchorId: string; // the positioned root this region's content orbits
  readonly memberIds: readonly string[]; // TOTAL over scene bodies; extentMpc's own input, kept not discarded
  readonly extentMpc: number; // DERIVED: max |member − anchor|, never authored; 0 when empty
};

// src/utils/scene/regionOfBody.ts — the body → region lookup, total over SCENE_BODIES.
export function regionOfBody(bodyId: string): BodyRegion | null; // null only for an id no region claims

// src/@types/scene/SStarSeed.d.ts — one transcribed Gillessen table row.
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

// src/@types/scene/OrbitalElements.d.ts — delta only.
//   - readonly parentId: string | null    ← REMOVED
//   + readonly focusId: string            ← every row names its focus (Q2)

// src/@types/engine/BodyInfo.d.ts — delta only. See "The S-star InfoCard shows orbital rows".
//   + readonly orbit?: BodyOrbitInfo      ← absent for Earth, the planets, the stars

// src/@types/engine/BodyOrbitInfo.d.ts — synchronously-known orbital card rows.
export type BodyOrbitInfo = {
  readonly focusLabel: string;
  readonly periodYr: number;
  readonly eccentricity: number;
  readonly pericentreAu: number;
  readonly pericentreSchwarzschildRadii: number; // the same pericentre in R_s — both units, by request
  readonly pericentreSpeedKmS: number;
};
```

**Naming, settled once.** The _card rows and their helpers_ are `pericentre*`
(`pericentreAu`, `pericentreSchwarzschildRadii`, `pericentreSpeedKmS`) — never
`periapsis*`. The _orbital elements_ keep `periapsis*`, because that is what the
existing type already uses (`OrbitalElements.argPeriapsisRad`,
`argPeriapsisRateRadPerCty`) and the seed fields track the element fields they feed
(`SStarSeed.argPeriapsisDeg`, `.periapsisEpochYr`). Element vocabulary and card
vocabulary; no third spelling of either.

### Files

| path                                                          | status                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/data/bodies/sStarElements.ts`                            | new — 39 hand-authored rows, inline provenance                              |
| `src/data/bodies/sceneSStars.ts`                              | new — the 39 drawn `StarBody` records                                       |
| `src/data/bodies/makers/sStar.ts`                             | new — `SStarSeed → OrbitalElements`                                         |
| `src/data/bodies/sceneAnchors.ts`                             | new — Sgr A\* + the Sun + derived famous-star anchors                       |
| `src/data/bodies/bodyRegions.ts`                              | new — the three region rows, extents derived                                |
| `src/@types/data/BodyRegionId.d.ts`                           | new — one type per file                                                     |
| `src/@types/scene/BodyRegion.d.ts`                            | new — one type per file                                                     |
| `src/@types/scene/AnchorBody.d.ts`                            | new — one type per file                                                     |
| `src/@types/scene/SStarSeed.d.ts`                             | new — one type per file                                                     |
| `src/@types/engine/BodyOrbitInfo.d.ts`                        | new — one type per file                                                     |
| `src/data/sources/s-star.ts`                                  | new — source entry, `type: 'body'`, `bearsLabel: false`                     |
| `src/data/sources/sgr-a-star.ts`                              | new — source entry, `type: 'body'`, `bearsLabel: true`                      |
| `src/utils/orbit/meanAnomalyAtJ2000.ts`                       | new — one function                                                          |
| `src/utils/orbit/skyPositionAngleToFrameAngle.ts`             | new — one function, Ω conversion                                            |
| `src/utils/orbit/skyInclinationToFrameInclination.ts`         | new — one function, i conversion                                            |
| `src/utils/scene/regionOfBody.ts`                             | new — one function, body → region (P3)                                      |
| `src/utils/scene/constellationOfBody.ts`                      | new — one function, constellation with `'None'` read as absent              |
| `src/data/bodies/bodySearchNames.ts`                          | new — the widened per-body search-alias lookup                              |
| `src/utils/star/absMagFromGalacticCentreK.ts`                 | new — one function, K → dereddened `M_K`                                    |
| `src/data/bodies/sStarAppearance.ts`                          | new — `(M_K, class) → temperature/absMag/radius`                            |
| `src/data/bodies/orbitPlaneFrames.ts`                         | +1 frame: the GC sky plane                                                  |
| `src/data/bodies/orbitalElements.ts`                          | `focusId` migration; concatenates `sStarElements`                           |
| `src/data/bodies/sceneBodies.ts`                              | `+ SGR_A_STAR`, `+ ...SCENE_S_STARS` — the membership seam                  |
| `src/services/engine/presentation/captionPriority.ts`         | +1 `CaptionKind` + its tier                                                 |
| `src/services/engine/presentation/captionFadeRules.ts`        | +1 row (build-forced by `satisfies`)                                        |
| `src/services/engine/presentation/sceneBodyLabels.ts`         | emits Sgr A\*'s caption                                                     |
| `src/services/engine/frame/foregroundMaxDistance.ts`          | stays a global scalar; derivation re-keyed to region extents (P3)           |
| `src/@types/engine/BodyInfo.d.ts`                             | `+ orbit?: BodyOrbitInfo`                                                   |
| `src/services/engine/helpers/buildFocusable.ts`               | body arm fills `orbit` by static lookup                                     |
| `src/components/CommandPalette/paletteRows.tsx`               | `'Solar System'` literal → chip helper; alias list reads the widened lookup |
| `src/components/InfoCard/CompactBodyCard/CompactBodyCard.tsx` | same `'None'` sentinel, chip suppressed                                     |
| `src/components/CommandPalette/utils/rankPaletteMatches.ts`   | scores over the widened per-body name lookup                                |

`sStarElements.ts` is its own file rather than 39 more rows in `orbitalElements.ts`,
which is already ~700 lines for 22 rows (Q4).

### The maker

```ts
export function sStar(row: SStarSeed): OrbitalElements;
//   focusId: 'sgr-a-star'
//   semiMajorMpc: row.semiMajorArcsec * GC_ARCSEC_TO_MPC
//   ascendingNodeRad: skyPositionAngleToFrameAngle(row.ascendingNodeDeg)
//   inclinationRad: skyInclinationToFrameInclination(row.inclinationDeg)  // NOT degToRad(i)
//   argPeriapsisRad: degToRad(row.argPeriapsisDeg)                        // genuinely unchanged
//   meanAnomalyRad: meanAnomalyAtJ2000(row.periapsisEpochYr, row.periodYr)
//   meanAnomalyRateRadPerCty: (2 * Math.PI * 100) / row.periodYr
//   plane: GALACTIC_CENTRE_SKY_FRAME
```

Both angle conversions are their own one-function files
(`src/utils/orbit/skyPositionAngleToFrameAngle.ts`,
`src/utils/orbit/skyInclinationToFrameInclination.ts`) so each carries its own
derivation and its own test. `ω` passing straight through is what makes dropping
the inclination conversion look consistent — hence the separate symbol rather than
an inline `degToRad`.

`meanAnomalyAtJ2000(TpYr, periodYr)` returns `2π(2000.0 − TpYr) / periodYr`,
wrapped to `[0, 2π)`. The existing per-century rate convention carries mean motion
forward, so the propagator learns nothing new — the same linear affine map that
moves a planet moves an S-star.

---

## The reference frame and the angle conversions

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
`r̂ × ê = ∂r̂/∂δ = n̂`. The triad `(ê, n̂, r̂)` is **right-handed**: `ê × n̂ = r̂`.

### Two conversions, not one

**This is the spec's highest-risk item, and `Ω_frame = 90° − Ω_astro` alone is not
enough.** Gillessen's reference basis is `(North, East, away-from-observer)` —
position angles run North through East, the ascending node is the receding
crossing. That basis is **left-handed** (`n̂ × ê = −r̂`) while
`GALACTIC_CENTRE_SKY_FRAME` is right-handed. The map between them is the component
swap `P: (N, E, away) → (E, N, away)`, with `det P = −1`, so the conversion is
orientation-reversing and lands on **two** elements:

| element | conversion                                |
| ------- | ----------------------------------------- |
| Ω       | `Ω_frame = 90° − Ω_astro`                 |
| **i**   | **`i_frame = 180° − i_astro`**            |
| ω       | `ω_frame = ω_astro` — unchanged           |
| M       | unchanged; the anomaly still runs forward |

**Derivation sketch** (write it out in the maker's docblock, per the transcription
discipline `orbitalElements.ts` establishes). Conjugate the standard
`R = Rz(Ω)·Rx(i)·Rz(ω)` — the rotation whose `P̂`/`Q̂` columns `keplerianEllipse.ts`
builds at `:89-97` — through `P`:

```
P·Rz(θ)·P = Rz(−θ)
P·Rx(θ)·P = Ry(−θ) = Rz(−90°)·Rx(θ)·Rz(90°)
```

`P` also swaps the perifocal seed, `(cos ν, sin ν, 0) → (sin ν, cos ν, 0)`, which
runs the in-plane angle backwards. Absorbing that reversal with `Rx(180°)` is what
moves the correction onto `i` and leaves `ω` alone; the whole product collapses to
`Rz(90° − Ω)·Rx(180° − i)·Rz(ω)`.

Two hand-checked cases pin it, both fed straight through `keplerianEllipse`:

- `(i, Ω, ω) = (0, 0, 0)` — the star sits at North at `E = 0` and moves toward
  East. In frame components that is `(sin E, cos E, 0)`, which
  `Rz(90°)·Rx(180°)` reproduces. `Rz(90°)·Rx(0°)` gives `(−sin E, cos E, 0)` —
  the mirror.
- `(i, Ω, ω) = (90°, 0, 0)` — edge-on, receding after the node. Frame
  `(0, cos E, sin E)`, reproduced by `Rz(90°)·Rx(90°)`.

The flip is also physically legible: `i_astro < 90°` means counter-clockwise on the
sky, i.e. angular momentum **toward** the observer, i.e. `i_frame > 90°` about a
normal that points away. S2's tabulated `i ≈ 134°` — clockwise on the sky, the
standard reading — becomes `i_frame ≈ 46°`.

**Converting Ω alone leaves all 39 orbits mirrored.** Inclinations in the table
span 24.7° to 171.1°, so both senses are present and the result is still 39
plausible-looking ellipses. No analytic invariant catches it; the astrometric
fixture is the only gate. If the derivation and that fixture disagree, the recorded
fallback is to enumerate the sign and reference combinations, keep the one that
reproduces the observations, and document the empirical result as such (Q5).

---

## Appearance

The table gives apparent K magnitude and an early/late flag; it gives **no per-star
spectral types**. The seed pipeline wants `absMag`, `temperatureK`, `radiusSolar`.

Derivation (Q8): per-star `M_K` from the distance modulus (14.56 at 8178 pc) and a
single named constant `A_KS_GALACTIC_CENTRE ≈ 2.5`, then `(M_K, spectralClass) →
temperature, absMag` through a small table.

| star               | K apparent | ⇒ M_K |
| ------------------ | ---------- | ----- |
| brightest in table | 10.0       | −7.1  |
| S2                 | 13.95      | −3.1  |
| faintest in table  | 17.8       | +0.74 |

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
- **Sgr A\***: `type: 'body'`, `bearsLabel: true`. The settings _home_ is free —
  `LABEL_HOME_BY_SOURCE_TYPE` (landed in #522) already carries a `body` row reading
  `homes.bodies[id].labelEnabled` (`labelHomeBySourceType.ts:54-57`). Caption
  _production_ is not; see below.
- **No S-star captions.** No S-star gets a caption kind or an emission.

`type: 'body'` rather than `'starCatalog'` is deliberate: S-stars are
element-positioned bodies exactly as planets are, and choosing `'body'` avoids
adding a second instance of the registry-versus-data disagreement that
`2026-07-29-near-field-stars-body-vs-star-domain.md` documents.

### Sgr A\*'s caption costs one new `CaptionKind`

An earlier draft said the caption "needs no new machinery". True of the settings
home, false of the two sites that actually put glyphs on screen:

| site                         | what it needs                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `captionPriority.ts:38`      | `CaptionKind` gains a member. `CAPTION_PRIORITY` and `CAPTION_FADE_RULES` are both `satisfies Record<CaptionKind, …>`, so both fail the build until they carry a row.                       |
| `sceneBodyLabels.ts:170-187` | The producer emits `SCENE_EARTH + SCENE_STARS + SCENE_PLANETS` only. Sgr A\* draws nothing, so the caption is its **entire** on-screen presence — unemitted, it is invisible with no error. |

Riding the existing `'star'` kind is actively wrong, not merely lazy: that row's
`labelEnabled` / `subjectVisible` read `starCatalogs.items.famousStar`
(`captionFadeRules.ts:104-113`), so Sgr A\*'s name would disappear whenever the
famous-star layer is muted. The Sun already sets the precedent — it has its own
kind for the same reason.

`docs/backlog/2026-07-29-caption-kind-shadow-registry.md` predicts exactly this
addition. Add the row; leave the item standing rather than folding its refactor in
here.

### `SCENE_BODIES` membership is a named seam of this design

`SCENE_BODIES` (`sceneBodies.ts:15`) is the flat registry three consumers key on,
and **each returns `null` on a miss** — no throw, no log:

| consumer                  | site                        | silent failure                |
| ------------------------- | --------------------------- | ----------------------------- |
| palette search rows       | `rankPaletteMatches.ts:95`  | not findable                  |
| `#focus=body-<id>` decode | `resolveFocusId.ts:141`     | deep link resolves to nothing |
| ref → InfoCard row        | `extractSelectionRow.ts:50` | a pick produces no card       |

That bites both new populations. Sgr A\* must be pushed into `SCENE_BODIES` or it
is neither searchable, focusable, nor selectable despite being a registered source
with a label. `SCENE_S_STARS` must be spread into the same list or picking an S-star
silently yields nothing.

This corrects the Q9 claim. Pick → InfoCard _is_ pure growth —
`buildFocusable.ts:35` builds a `BodyInfo` for every body row generically — but
that growth rests on `extractSelectionRow`'s `SCENE_BODIES.find` at `:50`
materialising a row in the first place. Membership is the precondition, not a
detail of it.

Nothing else in the search path needs adding. The palette dispatches on
`ScoredRow['kind']` — a UI row tag unrelated to `SourceEntry['type']` — and
`kind: 'body'` already exists at `paletteRowModel.ts:41`, `paletteRows.tsx:108-128`
and `focusIdForRow.ts:52`. `rankPaletteMatches` is pure over a static import, with
no settings gate, no async index, and no `bearsLabel` check: **a body is searchable
iff it is in `SCENE_BODIES` with a non-empty label.**

### Sgr A\* needs search aliases, and that widens an existing seam

Decided: Sgr A\* carries `['Sgr A*', 'Sagittarius A*', 'SgrA*']`. Deliberately
**not** "Galactic Centre" / "Galactic Center" — that name belongs to
[`docs/backlog/2026-07-30-galactic-center-place-labels.md`](../../../backlog/2026-07-30-galactic-center-place-labels.md),
which is already scoped, and claiming it here would collide with it.

Per-body alias lists are an existing seam, not a new one: `rankPaletteMatches`
scores each body over `FAMOUS_STAR_SEARCH.get(body.id)`'s names, falling back to
`[body.label]` (`rankPaletteMatches.ts:95-102`). Today that map has exactly one
contributor — `FAMOUS_STARS_GENERATED`, via `famousStarsIndex.ts:30-38`. Sgr A\*
is the **second** contributor, which by the project's own rule (simplicity #7: the
second special case is the consolidation trigger) means widening the lookup, not
branching on it.

```ts
// src/data/bodies/bodySearchNames.ts — the one per-body search-name lookup.
export const BODY_SEARCH_NAMES: ReadonlyMap<string, readonly string[]>;
//   contributors: FAMOUS_STARS_GENERATED's `names[]`, plus an authored table of
//   alias rows for bodies with no famous-star row. names[0] is the display label.
```

`rankPaletteMatches` reads `BODY_SEARCH_NAMES.get(body.id) ?? [body.label]`, and
`paletteRows.tsx:110-111`'s secondary-alias slot reads the same lookup rather than
`FAMOUS_STAR_SEARCH` — so a widened row shows its aliases as well as matching on
them, from one source. `FAMOUS_STAR_SEARCH` stays as the constellation index.

The rejected alternative is a row in `data/seeds/famous_stars.seed.json`:
`SCENE_STARS` and `FAMOUS_STAR_SEARCH` both derive from `FAMOUS_STARS_GENERATED`
(`sceneStars.ts:26`, `famousStarsIndex.ts:30-38`), so a seed row would make Sgr A\*
a **drawn** famous star — contradicting "draws nothing" and pushing the
solar-neighbourhood extent to 8178 pc. Two hand-maintained maps is the other
rejected alternative, and is what the widening exists to avoid.

### The S-star InfoCard shows orbital rows

Decided: the card carries period, eccentricity, pericentre and pericentre speed,
read from the seed table.

`BodyInfo`'s module header restricts the shape to what the engine knows
_synchronously_ from the resolved body, and routes the richer physical rows to the
async `FamousStarMetaEntry` sidecar. That sidecar is a famous-star shape
(`spectralType` / `distancePc` / `magV`, keyed by famous-star id) with no S-star
entries, so it is not the home for these rows — and it does not need to be. Orbital
elements are synchronously known: `SStarSeed` is static TS, imported, not fetched.
Extending `BodyInfo` with an optional orbital block is **growth within the type's
own stated rule**, not an exception to it.

`BodyInfo` gains one optional `BodyOrbitInfo` block, defined in
[Contracts](#contracts) and absent for every body that has no elements.

Pericentre speed is the row that earns the block: it turns a table of angles into
the feature's headline fact. It needs no central mass and no new constant — Kepler's
third law already ties `GM` to the star's own `a` and `P`, so vis-viva collapses to
`v_peri = (2πa/P)·√((1+e)/(1−e))`, which reproduces S2's ~7.7 × 10³ km/s from the
tabulated `a`, `e`, `P` alone. `pericentreAu` is `a(1 − e)` for the same reason:
derived at the card, never a fourth transcribed column.

The store row is untouched. `SelectionRow`'s body arm stays `id` / `label` /
`positionMpc` / `radiusKm`; `buildFocusable`'s body arm (`:35`) fills `orbit` by
static lookup on `row.id`, which keeps the fields out of RTK state and keeps
`buildFocusable` pure over static imports — its stated constraint.

### The palette's category chip derives from the region

Decided: `paletteRows.tsx:124`'s hardcoded `'Solar System'` fallback becomes a
`BodyRegion` lookup.

Today the chip reads `star ? star.constellation : 'Solar System'`. Every body not
in `FAMOUS_STAR_SEARCH` — Earth, the planets, the moons — gets `'Solar System'`,
which is correct for them and would be flatly false for Sgr A\* and for 39 stars 8
kpc away. The region table P3 builds already supplies the string, so this is a
lookup rather than a second hand-maintained list:

```ts
// src/utils/scene/regionOfBody.ts — new, one function.
export function regionOfBody(bodyId: string): BodyRegion | null;
```

`BodyRegion` therefore carries a display `label` and its `memberIds` (see
[Contracts](#contracts)). Neither is new data: `extentMpc` is
`max |member − anchor|`, so the member set already exists inside the derivation and
is merely kept rather than thrown away, and the three names are the same three the
region table is authored with. Region membership being **total** (see P3) is what
makes the lookup a replacement for the literal rather than a second fallback beside
it.

The rule, stated once and used verbatim everywhere: **the constellation when the
body has one, the region label otherwise.** A constellation is more specific than a
region, so famous stars keep theirs.

**Famous stars are not mislabelled today, and must not be routed through the
region.** Every `SCENE_STARS` row comes from `FAMOUS_STARS_GENERATED` and is
therefore always in `FAMOUS_STAR_SEARCH` (`sceneStars.ts:26`,
`famousStarsIndex.ts:30-38`), so each already shows its constellation. Deriving
their chip from the region would trade "Canis Major" for "Solar Neighbourhood" — a
regression, not a fix.

The one chip that _is_ wrong today is the Sun's. It is in the index, but its
generated row carries `constellation: 'None'` (`famousStars.generated.ts:12`) — the
seed table's sentinel for a body in no constellation — so the chip literally reads
"None". Reading that sentinel as **absent** routes the Sun to its region and the
chip reads "Solar System".

The sentinel gets one home, because two sites read it:
`paletteRows.tsx:124` and `CompactBodyCard.tsx:26,34` (whose miss path renders
nothing, but whose Sun _hit_ renders "None" exactly as the palette does).

```ts
// src/utils/scene/constellationOfBody.ts — new, one function.
export function constellationOfBody(bodyId: string): string | undefined; // 'None' ⇒ undefined
```

The palette chip is then `constellationOfBody(id) ?? regionOfBody(id)?.label`; the
compact card, which carries no region row, simply drops the chip when the helper
returns `undefined`. This retires the standing backlog item **"Sun constellation
chip renders 'None'"** — delete its `BACKLOG.md` index line in the same change, per
the backlog-hygiene convention. (It has no detail file.) Its recorded fix was
"suppress the chip"; that is what the compact card does, while the palette does
better by having a region to fall back to.

## Verification

**The fixture test is the load-bearing check.** `J/ApJ/837/30/table5` holds the
_observed_ astrometry behind the fits. Propagate to real observation epochs and
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

**The other class worth testing is the silent null.** Three registration seams fail
by returning nothing rather than by throwing, so nothing in the suite or the build
catches them:

- picking an S-star materialises an InfoCard row (`SCENE_BODIES` membership);
- `#focus=body-sgr-a-star` decodes and Sgr A\* is findable in the palette (the same
  membership, from the other two consumers);
- Sgr A\*'s caption survives muting the famous-star catalog (the mis-wiring that
  riding the `'star'` `CaptionKind` produces).

Prep carries its own obligation: `deriveBodyStates(CONST_J2000)` bit-for-bit
unchanged, and every existing band edge unchanged. `FOREGROUND_MAX_DISTANCE_MPC`
stays at 0.23 Mpc through both preps **and** through Sgr A\* joining the anchor
table — that last one is the load-bearing assertion, because it is exactly what
the retired origin-distance derivation would have broken.

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

Retired by this work:

- `docs/backlog/2026-07-29-planet-renderer-max-planets-cap.md`, folded into P2;
- the index-line-only item **"Sun constellation chip renders 'None'"**, folded into
  the palette-chip work.

Filed by this work: `docs/backlog/2026-07-30-camera-target-vs-origin-distance-gates.md`
— the pre-existing camera-to-target vs camera-to-origin mismatch the far-plane
analysis surfaced, deliberately not fixed here.

Adjacent and untouched: `docs/backlog/2026-07-30-galactic-center-place-labels.md`
(the four remaining POI markers, once Sgr A\* exists as a positioned body). Its
"Galactic Centre" naming is why Sgr A\*'s aliases stop at "Sagittarius A\*".
