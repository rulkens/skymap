# Grill Session: YOUNG STARS field redesign — 2026-08-09

Source: dust-seeding spike (PR #544). The user reported the YOUNG STARS
splat tier (one anisotropic star-grain splat per mid-age SF event,
task #20/#21) fails on four axes: population skewed toward the galactic
center instead of the arms' outer reaches; splat size constant with radius
where the references flare outward; ~9 fps at close zoom; and the overall
look far from the M74/NGC 1961 references. Goal: an architecture that can
reach the reference look without the perf crater.

Reference evidence gathered before the questions: M74 optical
(`public/images/famous-curated/m74/`), M74 JWST/MIRI (Wikimedia), NGC 1961
Hubble (NASA). Reading: the young population is a four-rung hierarchy
(star grains → ~65 pc knots → ragged clumps → kpc chains along arms), plus
a diffuse blue haze; nothing has an elliptical silhouette; complexes flare
with radius; blue complexes and dust interlock but occupy _disjoint_
structures (clumps in the holes of the dust foam). Root causes confirmed in
code: the fluid event CDF samples texel indices with no area weight
(log-polar texel area ∝ r² → event surface density ∝ 1/r², center-loaded;
`galaxyIsmMapFluidEvents.ts`); sigma drawn location-blind from 80–260 pc;
coverage = splat count × splat area = fragments (structural perf coupling).

---

## Q1: Architecture

**The question:** Repair the scattered-splat tier (A), replace it with a
field term (B), or hybrid field + sparse knots (C)?

**Considerations:**

- **Option A (repair in place):** radial re-weight, width law, quad caps.
  Least churn, but coverage stays fragment-priced forever and Gaussian
  silhouettes remain readable — fixes the numbers, not the look.
- **Option B (pure field term):** investigating the renderer showed there
  is no per-fragment analytic arm evaluation to ride — the galaxy IS the
  splat mixture — so "field term" concretely means: per-arm CHAINS of
  overlapping anisotropic components laid along the ridge walk (the
  `pushArmRidges`/`deriveArmSpurs` walk; spur records are shape-compatible,
  so spurs get covered by the same loop), with the star-grain branch
  (negative textureWeight, exists) plus a NEW per-fragment map modulation.
  Width law inherited from `armCrossSigma`; radial profile from the arm
  fade envelope (kills the center skew without touching the event bug);
  overlap bounded at 2–3 neighbours (kills the crater); comps[4i+3].w is a
  documented spare lane for the modulation weight.
- **Option C (hybrid):** B plus a sparse population of compact bright
  knots. The sketch revealed C is not a different architecture — just a
  second, sparser chain population on the same mechanism.

**Decision:** **B first** — build the chain mechanism, evaluate visually;
add a knot population later only if the map-driven clumps don't read as
discrete clusters. The A/B/C fork collapsed into a knob once the chain
sketch existed.

## Q2: Fate of the existing machinery

**The question:** Replace the scattered one-splat-per-seed builder outright,
or keep both behind a toggle while evaluating?

**Considerations:**

- **Replace:** old look preserved in git; coexistence would mean two flux
  paths and double UI through a retuning phase; the evaluation target is
  the reference images, not the old splats.
- **Coexist:** safer-feeling, but the premise of the redesign is that the
  old model cannot reach the reference.

**Decision:** **Replace outright.** `buildBlueAssociations`' placement
logic, the mid-age seed consumption, and the scattered-blob knobs
(`complexes`, `coherence`, `armBias`, per-splat `sizeScale`) go; DIG keeps
its own event-lifecycle coupling.

## Q3: Flux currency

**The question:** What does the chain's total flux anchor to?

**Considerations:**

- **(a) `brightness × clusterFluxSum`** (today's currency): tiers stay in
  ratio under HII recalibration.
- **(b) debit `armExcessFlux`** (chromatic split, conserving): right
  eventual physics, but re-opens the arm-share calibration mid-spike.
- **(c) free-standing `brightness × const`:** absolute, immune to other
  sliders — fewest moving parts while judging the mechanism. Pivot c→a is
  one line (the anchor scalar), verified before deciding.

**Decision:** **(c) now, pivot to (a) when the look graduates.** Two
riders: per-node flux follows the arm's own local intensity law (per-arm
weight, fade envelope, radial profile, along-ridge clump modulation) so
weak arms get proportionally faint young stars; and the map modulation is
mean-normalized CPU-side (mean of the shaped channel at readback) so the
contrast knob is flux-neutral — the coverage-growth dimming trap from the
old tier, closed by construction. Known accepted debt: node-level arm law ×
map clumps double-dips arm contrast ~1.5–2×; tame with knobs, decorrelate
only if it shows.

## Q4: Knob set

**The question:** Which sliders survive the collapse?

**Decision (presented, carried into the spec for review):** Brightness
(total flux), Contrast γ (shapes the map read, flux-neutral), Map depth
(mix toward the map modulation — the "how clumped" knob), Width (fraction
of `armCrossSigma`), Texture (existing grain weight). Scale height stays a
constant (~100 pc). Population/Size/Coherence/Elongation die with the
scattered blobs.

## Q5: Clump-placement source

**The question:** Which field modulates the chains per-fragment — where do
the clumps and gaps come from?

**Considerations:**

- **recentSf channel:** rejected by the user — it is stamped expanding
  circles around event sites (`exp(-eventAge/12)`), and the DIG/shell
  seeding already keys off the activity family: three tiers lighting the
  same circles.
- **dust channel (detail ratio + downstream lane offset):** rejected by the
  user on sight of the references; the literature pass then confirmed the
  rejection quantitatively — clusters are statistically dissociated from
  natal gas by ~6 Myr, the 5–100 Myr population sits in cavities it carved
  (anti-correlated with dust at clump scale), and the textbook lane offset
  is a ~17% minority mode ([10-young-star-placement.md](../research/m74-jwst/10-young-star-placement.md)).
- **dedicated stars tracer in the fluid sim:** deposit at events ∝ gas
  consumed, advect with the existing velocity field, decay with
  τ ≈ 50–100 Myr (the measured structural-dissolution clock,
  [11-young-star-clustering.md](../research/m74-jwst/11-young-star-clustering.md)).
  Born-in-clearings, sheared into chains, dissolving with age — the three
  measured behaviours, emergent. Initially deferred as "the eventual
  physics"; the research promoted it to the only candidate with the right
  sign.

**Decision:** **Stars tracer.** The state texture has no free lane, but the
fluid generator's `eventAge` lane is write-only bookkeeping (audit: fluid
ignition/resets key off the event stamp; only the pack reads the lane) —
it is rebuilt as `stars`.

## Q6: Repurposing safety + naming

**The question:** Does anything downstream functionally consume
`eventAge`/`recentSf`, and what gets renamed?

**Considerations (audit findings):**

- **Automaton generator: `eventAge` IS load-bearing** (refractory gating,
  ignition dust floor). Untouched — only its pack's output label changes;
  its `exp(-age/12)` becomes that generator's documented approximation of
  the stars channel.
- **Exactly one functional packed-lane consumer:** the HII shell
  map-seeding CDF (`hiiRegions.ts` `texel.recentSf`). Left alone it would
  scatter shells onto 20–100 Myr drifted material. Fix folded in: switch to
  `texel.activity` — the short-memory EMA of the same event stamps; the old
  comment's objection was to the `gas ×` product, not to activity alone.
- Everything else is display/plumbing: palette, decode, ring-means/mean
  helpers, struct fields, channel-weight slider, contract table.

**Decision:** Commit the tracer; rename the whole y family to `stars` in
the SAME commit as the semantics change (state lane, packed lane, structs,
`IsmMapChannelWeights`, `ismMapRecentSfWeight` → `ismMapStarsWeight`,
slider label, plus a second preset-key shim). Naming precursor already
landed (`bc56cc19b`): the three spellings (`eventAge`/`recentSf`/`Recent`)
were collapsed to one public spelling `recentSf`, with the state→pack
transform documented solely in `GalaxyIsmMap.ts`'s contract table.

---

## Side work landed during the session

- `bb7c467a3` ISM MAP section moved beside DEBUG VIEWS (it informs every
  tier below it).
- `b93076148` ARM CLOUD + SPURS nested inside ARM OVERDENSITIES.
- `bc56cc19b` recentSf channel-weight spelling unified + preset key shim.

## Deliberately out of scope

- The event-CDF texel-area bug (1/r² center loading) stays: the young-star
  tier stops consuming events entirely, but dust/DIG/HII still do —
  fixing it re-distributes the whole hand-calibrated map. Backlog.
- Bright-knot population (option C's second chain) — only if the tracer
  clumps don't read as clusters.
- Flux pivot c→a — one line, when the look graduates.
- Perf caps on the remaining full-res HII tiers (shells/DIG quad caps) —
  orthogonal; the young-star crater cause is removed by the redesign.
