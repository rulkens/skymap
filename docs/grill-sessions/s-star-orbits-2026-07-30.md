# Grill Session: S-star orbits around Sgr A* — 2026-07-30

Source: a conversation that began as "is there enough data on the Arches cluster to
build a star catalog?", widened to four Galactic Center feature options, and
converged on rendering the S-star orbits. Ran after the `refactor-ground`
checkpoint, at the user's request, because the checkpoint had genuine decision
branches (anchor vs focus naming, whether the Sun becomes an explicit anchor, and
the Ω convention conversion).

We are rendering the 39 bound S-star orbits around Sgr A\* as Keplerian bodies
driven by the existing solar-system time control. The data is Gillessen+2017
(VizieR `J/ApJ/837/30/table3`): 40 rows of classical elements, of which 39 are
bound. The feature's appeal is that it reuses the orbit machinery almost whole,
and that a viewer can watch S2 whip through pericentre at 2.6% of light speed on
a *measured* orbit.

Three feature-shape decisions were taken before the grill began, in the
brainstorming pass:

- Sgr A\* is an **invisible labelled anchor** in v1. A "beautiful Sgr A\*"
  rendering is a deliberate follow-up.
- **All 39** bound orbits, not a curated subset. S111 is excluded: `a = −12.3″`,
  `e = 1.092`, no period — genuinely unbound, and `propagateElements` is
  elliptical-only.
- **Selection + focus only.** No tour beat, no URL deep link in v1.

And two packaging decisions at the refactor-ground checkpoint: **one PR with prep
commits sequenced first**, and **fold the `MAX_PLANETS` cap fix into the capacity
prep**.

---

## Q1: Does `StarBody` keep its baked position?

**The question:** S-stars must be *drawn* like stars (a point at distance, one
resolved sphere up close) but *positioned* like planets (from orbital elements,
per frame). Does that combination exist, and if not, which side gives way? This
decides every type shape downstream.

The two body families split on exactly this axis. `PlanetBody` is identity only —
its docblock says a body's "time-varying position and orientation live in its
`BodyState`, derived from the orbital elements by `deriveBodyStates`, never baked
here". `StarBody` carries a static `positionMpc` that `starPointsLayer:257` and
`starSpheresLayer` read directly. So `StarBody` braids identity with position, and
no drawn star can be element-driven.

**Considerations:**

- **Option A (un-braid `StarBody`):** `StarBody` becomes identity-only like
  `PlanetBody`. The Sun, the 119 famous stars, and Sgr A\* all become **static
  anchors** seeded into the state map — zero-rate roots of the focus graph — and
  Keplerian rows focus on any anchor. One position path for every body, and it
  collapses the four `parentId === null` branches into the same change. Cost: a
  wide zero-behaviour-change refactor across `starPointsLayer`,
  `starSpheresLayer`, `createEngineData`, `sceneBodyLabels`,
  `foregroundMaxDistance`, needing the same bit-for-bit J2000 proof
  `deriveBodyStates` used.
- **Option B (separate drawn kind):** leave `StarBody` alone; S-stars become
  their own drawn kind with element-driven positions. Smaller prep, but it yields
  a second star-drawing path *and* a second position path, and both star layers
  learn to handle two kinds. This is the parallel-path bolt-on `refactor-ground`
  exists to catch.
- **Option C (bake at J2000):** give S-stars static positions frozen at the
  epoch. No prep at all, and it discards the animation that is the entire point
  of the feature.

**Decision:** Option A. `PlanetBody`'s own docblock already states the principle;
`StarBody` is the outlier, not the norm. Option B adds the second position path,
which would make a third body kind unavoidable later. Option C defeats the
feature. The width of A is real but it is mechanical and provable rather than
risky, and this feature is what makes it worth doing now.

---

## Q2: Does `focusId` admit `null`?

**The question:** `parentId: null` currently means "focus at the render origin",
i.e. heliocentric. Does that null survive, or does every element row name a focus
explicitly?

Relevant discovery: **the Sun already exists as an authored-position body.**
`famousStars.generated.ts` opens with `id: 'sun', distancePc: 0`, and
`sceneStars.ts` notes that collapses to `[0,0,0]`. Meanwhile
`deriveBodyStates.ts:85` separately hardcodes `RENDER_ORIGIN_MPC` as the
heliocentric focus. "Where the Sun is" already has two homes, agreeing only
because the origin happens to be the Sun today.

**Considerations:**

- **Option A (no null):** every element row carries `focusId: string`. The Sun
  becomes an explicit anchor at an authored heliocentric `[0,0,0]`; the eight
  planets get `focusId: 'sun'`. The four `parentId === null` branches go to
  **zero**, not to one. It also decouples "the Sun's position" from "the render
  origin" — which matters because `renderOrigin.ts:14` documents a dynamic origin
  as a future customization point, and if the origin moves, the Sun must not move
  with it. Two different facts, currently one value by coincidence.
- **Option B (keep null):** `focusId: string | null`, null still meaning the
  render origin, anchors used only for off-origin bodies. Smaller diff — eight
  planet rows stay untouched — but the null branch survives in one place and the
  Sun/origin conflation survives with it.
- **Option C (anchors are just famous stars):** put Sgr A\* into the famous-star
  seed and let that table be the anchor set. Maximum reuse, but Sgr A\* is not a
  star: `absMag` / `temperatureK` / `radiusSolar` are meaningless for it, it would
  land in `FAMOUS_STARS_COUNT` (`StarsSection.tsx:58`), and it was chosen not to
  draw.

**Decision:** Option A. The null is not carrying information, it is carrying an
assumption ("focus = origin = Sun") that this feature is the first thing to
violate and that `renderOrigin.ts` already warns will stop holding. Making the Sun
explicit costs eight row edits and retires the conflation permanently. Option C
would force sentinel values into a seed table generated from curated stellar
data, and the "not a star" problem worsens with every additional non-stellar
anchor.

---

## Q3: What happens to the camera's body-membership predicate?

**The question:** `liveBodyPosition` returning non-null is not merely a position
lookup — it is the membership predicate for `followBody.isActive`
(`cameraDrivers.ts:276`), the focus-tween skip (`watchFocusTweenSaga.ts:97`),
`applyFocusedBodyPivot`, and NEAR0 selection-ring centring. Its docblock says
"null when the focus is not a body present in the snapshot". Presence in the map
is standing in for "this thing moves". Q1's answer puts all 119 famous stars into
the snapshot, breaking that proxy: selecting Vega would flip from tween-then-stop
to follow-driven, and memory records that the follow driver overrides the landing
distance. So the prep is **not** behaviour-neutral unless this is handled.

**Considerations:**

- **Option A (accept the change):** famous stars become follow-driven, uniform
  with planets. Risk: landing distance shifts for 119 objects, needing a visual
  pass, and a behaviour change rides in a commit labelled as a refactor.
- **Option B (un-braid the predicate too):** separate "has a position this frame"
  from "moves this frame". Anchors sit in the map for position but are not
  follow-driven; Keplerian rows are. Prep stays exactly behaviour-neutral, so the
  bit-for-bit J2000 proof still holds. Consequence: Sgr A\* also gets
  tween-then-stop, and the 39 S-stars get follow — the honest split, since they
  are the ones actually moving. Cost: a new explicit predicate, and
  `liveBodyPosition`'s contract gets rewritten rather than left alone.
- **Option C (partial map):** only S-stars and Sgr A\* enter the snapshot; famous
  stars keep baked positions. Walks back Q1 and reinstates two position paths.

**Decision:** Option B. It is the same complecting pattern already being pulled
apart — a structural fact standing in for a semantic one — and "follow the things
that move" is a predicate that says what it means, which "present in the snapshot"
never did. It also keeps prep provably neutral, which matters because prep lands
as commits on a shared PR.

---

## Q4: Where do the 39 rows come from, mechanically?

**The question:** three seeding precedents exist in the repo. Which fits 39 rows
of frozen, published orbital elements?

**Considerations:**

- **Option A (seed JSON + generator):** mirror famous stars —
  `data/seeds/s_stars.seed.json` → `npm run build-s-stars` →
  `sStars.generated.ts`. Committed data, no build-time network. But a generated
  artifact and a build step for data that cannot change.
- **Option B (build-time VizieR fetch):** `data/raw/gillessen/` with a resume
  cache, a `rawDataRegistry.ts` entry, and a parser. Zero transcription risk and
  mechanically reproducible, at the cost of standing machinery — a fetcher, a
  registry entry, a parser — for 39 rows from a 2017 paper.
- **Option C (hand-authored TS with inline provenance):** the way
  `orbitalElements.ts` itself is written, each row carrying its source table line
  in a comment, converted at the seed site through an `sStar` maker exactly as
  `satellite` does for JPL's moon lines.

**Decision:** Option C, in its own file, with two qualifications.
`orbitalElements.ts` *is* this pattern, and its stated authoring discipline exists
for precisely this case: published elements transcribed with the raw table line in
each row comment "so the transcription stays checkable". The famous-stars
generator exists because that seed is curated over time with images and async
metadata; these 39 rows are a frozen citation. Qualification one: the rows go in
**`sStarElements.ts`**, not into `orbitalElements.ts`, which is already ~700 lines
for 23 rows. Qualification two: transcription risk is real at 39 × 8 values, so a
**one-off** VizieR diff script verifies the table once and its output is recorded
in the spec — getting Option B's correctness guarantee without Option B's standing
machinery.

---

## Q5: How is the Ω convention pinned down?

**The question:** Gillessen's angles are referenced to the plane of the sky at the
Galactic Center and Ω is an astronomical position angle. What frame does that map
to in skymap, and how do we know we got the sense right?

An earlier claim in the refactor-ground checkpoint — that the elements are
"equatorial" — was **wrong** and is corrected here. The reference plane is the
plane of the sky at the GC, whose pole is the line of sight to Sgr A\*. The
existing seam expresses it exactly:

```
planeFrameFromPole(266.41684, -29.00781)
  xAxis  = [-sin α, cos α, 0]        = East    (the East tangent, at any Dec)
  yAxis  = normal × xAxis  = r̂ × ê  = North
  normal = direction to Sgr A*, i.e. AWAY from the observer
```

Both identities were verified: `∂r̂/∂α` normalized is `[-sin α, cos α, 0]`, and
`r̂ × ê = ∂r̂/∂δ = n̂`. So no new frame machinery — one more `planeFrameFromPole`
call. **But the conversion is orientation-reversing:** the frame measures from
`xAxis` (East) toward `yAxis` (North), while an astronomical position angle runs
North through East. So `Ω_frame = 90° − Ω_astro`, a reflection, which couples to
the sign of the inclination and the line-of-sight direction. Inclinations span
24.7° to 171.1°, so both senses are present and a mirror error will not announce
itself.

**Considerations:**

- **Option A (derive, then test against observed astrometry):** work the mapping
  out analytically, then verify against `J/ApJ/837/30/table5`, the *observed*
  positional data behind the fits. A genuine external oracle; a mirror error fails
  immediately.
- **Option B (fit empirically):** enumerate the sign/reference combinations, keep
  whichever reproduces the astrometry, record the result. Same oracle, less
  derivation — but nobody can then say *why*, which the comment discipline in
  `orbitalElements.ts` requires.
- **Option C (convert to state vectors offline):** author positions and velocities
  and propagate, bypassing Ω entirely. Abandons the Keplerian element pipeline for
  a second parallel path.

**Decision:** Option A, with Option B as an explicitly recorded fallback if the
derivation and the data disagree. The test is the load-bearing part either way,
and it must be a real fixture from `table5`, never a round-trip against our own
maker.

---

## Q6: What happens to `FARTHEST_BODY_MPC`?

**The question:** Sgr A\* at 8178 pc would enter a max currently set by Eta
Carinae at 2300 pc, and that constant is a multiplier base for four derived
values. What is the durable answer, given more Galactic datasets are expected?

The naive consequence:

| derived constant | today (2300 pc base) | with Sgr A\* in the max |
| --- | --- | --- |
| `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` (×4) | 9.2 kpc | 32.7 kpc |
| `FOREGROUND_MAX_DISTANCE_MPC` (×100) | 230 kpc | 818 kpc |
| `starBackdrop.fullAt` (×2) | 4.6 kpc | 16.4 kpc |
| `starBackdrop.goneAt` (×10) | 23 kpc | 81.8 kpc |

`scaleFadeBands.ts:100` justifies `goneAt` as "≈23 kpc, well before Milky-Way
[scale]". At 81.8 kpc that justification is void — the Milky Way is ~30 kpc
across, so famous-star points and captions would linger past the galaxy.

The deeper finding: `scaleFadeBands.ts:18` records that three rows key on **the
camera's distance from the heliocentric render origin**. For S-stars that value is
~8178 pc wherever you stand at the GC, and the *same* 8178 pc if you fly 8 kpc the
other way. **The current model cannot express "this content appears when you are
near it" for content that is not near the Sun.** So merely protecting the existing
bands leaves the S-stars ungatable.

And there are already **three** extents, one pair of which already duplicates:

| extent | scope | band shape |
| --- | --- | --- |
| `FARTHEST_BODY_MPC` | star seeds | `starBackdrop` ×2 / ×10 |
| `FARTHEST_PLANET_MPC` | planet seeds | `bodyGlintBackdrop` ×2 / ×10 |
| `MAX_ORBIT_EXTENT_MPC` | orbit reach | whole-layer sub-pixel cull |

The first two are two regions with two extents and the **identical ×2 / ×10 band
shape, hand-written twice**. Nobody noticed because both share the Sun as anchor,
so the distinction never had to be named.

**Considerations:**

- **Option A (exclude anchors from the max):** the constant keeps meaning what its
  consumers assume; every existing band is preserved bit-for-bit. But it leaves
  the S-stars ungatable, so it is *insufficient*, not merely narrower.
- **Option B (freeze to the literal 2300 pc):** honest that the bands are
  calibrated to the local neighbourhood, but discards the "adding a seed carries
  the change" property `foregroundMaxDistance.ts` deliberately built.
- **Option C (let it move, re-tune the four multipliers):** most work, most risk,
  and it re-tunes constants for a reason unrelated to their purpose.
- **Option D (`BodyRegion`, the full model):** the group becomes first-class, and
  the keying quantity becomes anchor-relative:

  ```ts
  type BodyRegion = {
    readonly id: string;          // 'solar-neighbourhood' | 'galactic-centre'
    readonly anchorId: string;    // the positioned root body
    readonly extentMpc: number;   // DERIVED: max |member − anchor|, never authored
  };
  ```

  Fade bands become a shape applied per region (`fullAt: extent × 2`,
  `goneAt: extent × 10`) keyed on `|camPos − anchorPos|`.
  `FOREGROUND_MAX_DISTANCE_MPC` stays global — it is the NEAR0 far plane, so it
  must cover everything: `max over regions(|anchor| + extent) × 100`.
  `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC` becomes per-region, which is what its name
  already claims. Precedent: the star-caption row **already** keys on
  content-relative distance, so anchor-relative keying is not a new concept — it is
  the concept three rows did not get.

**Decision:** Option D. Not speculative prep, for two independent reasons: the
minimal version is *wrong* rather than narrower, and the second case is **already
in shipped code** (`FARTHEST_BODY_MPC` / `FARTHEST_PLANET_MPC` with the same band
shape). A third dataset — Arches, Quintuplet, a globular, the LMC — then arrives
as a region row plus its members.

**Scope note:** this made P3 larger than P1 and P2 combined, and it was not in the
signed-off checkpoint. The user confirmed the wider prep and the same packaging.
The name `BodyRegion` was chosen over `BodyNeighbourhood` because "region" is
standard astronomy usage and neutral about locality, where "neighbourhood" reads
as *ours*.

**Extension (user, mid-session): orbit trails too.** Confirmed and worse than
"probably". `orbitTrailsLayer.ts:117`:

```ts
function maxHeliocentricReachMpc(elements: OrbitalElements): number {
  const own = apoapsisMpc(elements);
  // Every moon parent is itself heliocentric, so one hop resolves the focus.
  return elements.parentId === null ? own : apoapsisMpc(elementsById(elements.parentId)) + own;
}
const MAX_ORBIT_EXTENT_MPC = Math.max(...ORBITAL_ELEMENTS.map(maxHeliocentricReachMpc));
```

With Sgr A\* as a focus, an S-star's "heliocentric reach" is 8178 pc + 1934 AU, so
`MAX_ORBIT_EXTENT_MPC` jumps from Neptune's ~30 AU by a factor of ~1.7 × 10⁷. The
whole-layer cull then computes `nearestMpc = max(|camPos| − MAX_ORBIT_EXTENT, 0)`,
which is **0 for any camera within 8 kpc of the Sun** — so every solar-system trail
stays enabled everywhere and the cull is silently defeated. P3 therefore covers all
three extents, and the region is the gating anchor for every content kind it owns:
points, spheres, glints, trails, labels. P1's focus-graph fix also retires the
one-hop recursion here, so P1 and P3 compose rather than overlap.

---

## Q7: How do the S-stars register as content?

**The question:** what owns the user-facing visibility intent for 39 new drawn
objects? Two backlog items landed in the same merge warning that this is where
things get missed: "`LAYER_GROUPS.labels` totality is unchecked — near-missed
twice", and "Two label layers register fade handles nothing reads".

**Considerations:**

- **Option A (their own source entry):** a new `src/data/sources/s-star.ts` with
  its own `bearsLabel`, settings row, fade layer, and `LAYER_GROUPS` membership.
  Independently toggleable and fade-animatable for tours. Costs a full
  registration pass across the surfaces the backlog says get missed.
- **Option B (ride `famousStar`):** no new registration; S-stars are just more
  seeded stars. Cheapest, but they would toggle with Vega and Betelgeuse and the
  settings row's count would silently jump from 119 to 158.
- **Option C (ride the `BodyRegion`):** the region becomes the visibility unit as
  well as the gating unit — one settings row per region. Consistent with P3, and a
  fourth dataset gets its toggle for free. Risk: `BodyRegion` would carry both
  scale-gating and user intent, and those may need to diverge (`orbitTrails` is
  *already* an independent toggle today).

**Decision:** Option A, against the recommendation of Option C. The user's call is
the more decomplected one: the region owns **scale gating**, the source entry owns
**intent**, and keeping them separate matches `orbitTrails` already being its own
toggle. Option C would have braided two concerns whose divergence is demonstrably
real rather than hypothetical.

---

## Q8: What do the 39 stars look like?

**The question:** the seed pipeline wants `absMag` + `temperatureK` +
`radiusSolar` (`FamousStarRow`'s shape). Gillessen gives K magnitude and a bare
early/late flag — 30 early, 8 late, 2 blank — and **no per-star spectral types**.
How does appearance get derived?

With distance modulus 14.56 at 8178 pc and `A_Ks ≈ 2.5` toward the central parsec:

| star | K apparent | ⇒ M_K dereddened |
| --- | --- | --- |
| brightest in table | 10.0 | −7.1 |
| S2 | 13.95 | −3.1 |
| faintest in table | 18.0 | +0.9 |

S2 landing at M_K = −3.1 matches its published B0–2V classification, which sanity-
checks the whole chain.

**Considerations:**

- **Option A (derive per-star from K + extinction + class):** compute M_K per star
  from the distance modulus and one named `A_KS_GALACTIC_CENTRE` constant, then map
  (M_K, early/late) → temperature and absMag through a small table. Preserves the
  real **8 magnitudes** of measured brightness spread; confines modelling to a
  single named constant.
- **Option B (two representative appearances):** every early star renders as a
  B1V, every late one as a K giant. Simplest, and visually the worst option: 39
  co-located identical points is a blob, where the magnitude spread is what gives
  the cluster structure.
- **Option C (cross-match real types where they exist):** use published
  classifications for the handful that have them, fall back to A for the rest.

**Decision:** Option A. It lets the one *measured* per-star quantity drive the
visually dominant property, while confining modelling to a single citable
constant. Option C sounds more rigorous but puts two derivation paths in one
39-row table for a handful of rows, and the published types mostly agree with what
A derives anyway.

Two notes carried into the spec: `A_Ks` is a **modelling choice, not a
measurement**, and shifts all 39 together — so it is one named constant with its
source cited, never folded into per-row numbers. And the faint tail will be
genuinely dim (M_K ≈ +1); that is correct, so the visual check is "can I see S2 and
the bright ones clearly", not "can I see all 39".

---

## Q9: Which S-stars get labels?

**The question:** 39 co-located objects with catalogue designations. Who gets a
caption?

`CAPTION_PRIORITY` is already a table — `CaptionKind = 'sun' | 'earth' | 'planet'
| 'star' | 'constellation'` — with apparent size as the within-tier tiebreaker.

**Considerations:**

- **Option A (all 39 on the `'star'` tier):** the existing apparent-size
  tiebreaker curates for free — all 39 are at the same distance, so it reduces to
  brightness, the measured quantity. No authored subset, no new caption kind. Risk:
  the open "Label declutter toggle + hysteresis" backlog item means 39 co-located
  labels would exercise the known flicker harder than anything currently in the
  scene.
- **Option B (a curated labelled subset):** S2 plus the shortest-period stars,
  rest pickable-only. Predictable and quiet, but a hand-maintained list where
  "which ones matter" is a judgement that will drift.
- **Option C (no labels at all):** identity via InfoCard on pick only. Cleanest
  visually; you lose the ability to find S2 without clicking around.

**Decision:** Option C, against the recommendation of Option A, with the user's
stated intent that **only Sgr A\* gets a caption**. This drops the 39-label
declutter risk entirely, leaves `CAPTION_PRIORITY` untouched, and avoids stressing
the open flicker item. The S-stars remain pickable and drive the InfoCard.

Two consequences resolved without a further question:

- **Sgr A\*'s caption is free.** `LABEL_HOME_BY_SOURCE_TYPE` (landed in #522)
  already has a `body` row reading `homes.bodies[id].labelEnabled`. Sgr A\* as a
  body source with `bearsLabel: true` needs no new source type.
- **S-stars register as `type: 'body'`,** not `'starCatalog'`. They are
  element-positioned bodies exactly as planets are, and the new backlog item
  `2026-07-29-near-field-stars-body-vs-star-domain.md` is specifically about
  `famousStar` being a star catalog in the registry while being a body in the data
  layer. Choosing `'body'` avoids adding a second instance of that disagreement.
  Their entry carries `bearsLabel: false`, matching `glade.ts` / `milliquas.ts`.

---

## Q10: What proves this is correct?

**The question:** the likeliest bug is a mirrored orbit from the Ω sense (Q5), and
it produces 39 plausible-looking ellipses. What test can actually fail on it?

**Considerations:**

- **Option A (astrometric fixture test):** `J/ApJ/837/30/table5` is the *observed*
  positional data behind the fits. Propagate a few stars to real observation epochs
  and assert sky-projected offsets match measured (ΔRA, ΔDec) within quoted
  uncertainties. Catches a mirror, an arcsec/AU unit slip, and a wrong Ω sense.
  Three stars chosen deliberately: **S2** (best-measured, 16 yr), one with **i <
  90°**, one with **i > 90°** — the inclination pair is what makes a mirror fail
  rather than pass. Cost: a small astrometric fixture committed to the repo, needing
  the same transcription care as the element table.
- **Option B (analytic invariants only):** pericentre equals `a(1−e)`, period
  matches `2π/n`, the body sits on its own trail. Cheap — and a mirrored orbit
  passes every single one.
- **Option C (visual check against the published S2 figure) plus B.** A human
  check that decays.

**Decision:** Option A, plus one visual pass. Under the project's testing
convention ("will it ever fail on a real bug no other test or compiler check
catches?"), Option B is precisely the restatement-of-constants shape that document
says not to write — green against the exact bug we are most likely to have. The
visual pass stays valuable for what a fixture cannot judge: whether the brightness
spread reads, whether the trails clutter, whether the region fade bands feel right.

---

## Findings that needed no decision

- **Precision is a non-issue.** `composeBodyMvp` composes proj·view·model entirely
  in f64 and narrows once at the GPU upload boundary, exactly for the Earth-at-1-AU
  cancellation case. S2's orbit at 8.18 kpc is a milder ratio than
  Earth-at-Earth-radius.
- **Slab routing is forced, not chosen.** `slabs.ts:107` fixes COSMO's near plane
  at 10 kpc and states draws inside 10 kpc cannot live there. The GC at 8.18 kpc
  goes on NEAR0, the f64 slab the bodies already use.
- **The clock already reaches this.** `RATE_LADDER` tops out at `10 yr/s`, so S2's
  16-year period is a 1.6-second lap at maximum and a comfortable 5–16 seconds at
  the `1–3 yr/s` detents. The longest period in the table (3580 yr) is a 6-minute
  lap.
- **`starPointRenderer` already grows dynamically** (`starPointRenderer.ts:209`
  recreates the buffer when `stars.length > capacityStars`), so 39 more star points
  are free. This is also the third argument for the capacity prep being
  consolidation rather than a bump: one of the three renderers already does the
  right thing, and the orbit-trail and planet renderers are the ones hardcoding 24.
- **Selection, focus and the InfoCard are pure growth.** `buildFocusable.ts:35`
  builds a `BodyInfo` for every body row generically, and `#focus=body-<id>`
  follows.

## Deliberately out of scope

The backlog item `2026-07-29-near-field-stars-body-vs-star-domain.md`
(`needs-grill`) covers the same files as Q1–Q3 but a different concern: **identity
and domain** — is the Sun a star or a body, which source code wins a pick, where
`famousStarsMeta` lives. This work touches **position sourcing** only. The two are
orthogonal in practice: picking keys on `seedIndexOfBody(star.id, SCENE_STARS)`,
`visibleStars` gates on `settings.bodies.items.sun.enabled`, and
`Source.Sun` vs `Source.FamousStar` is untouched either way. The spec carries an
explicit note that it does not resolve that item, keeping its grill available
intact.

Also deferred by explicit choice: a **beautiful Sgr A\* rendering** (v1 draws
nothing), a **tour beat**, a **URL deep link**, and **Option C from the
brainstorming pass** — Galactic Center place labels, now at
`docs/backlog/2026-07-30-galactic-center-place-labels.md`.
