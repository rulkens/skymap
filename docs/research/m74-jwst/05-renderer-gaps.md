# What the renderer cannot capture in the M74 MIRI image — synthesis (2026-08-03)

Synthesis of [01-image-morphology.md](01-image-morphology.md), [02-bubbles.md](02-bubbles.md),
[03-clouds-and-dust.md](03-clouds-and-dust.md), [04-supernovae.md](04-supernovae.md), read
against the branch's actual code (`sfMapStep.wesl`, `sfEventCatalog.ts`,
`dustBubblePlacements.ts`, the `docs/research/milky-way/` docs) as of
`133295cf`. Claims below inherit the per-doc verification labels; anything
stated about the code was read directly from the branch.

**CORRECTION (same day, after the dust rewrite was pointed out):** the
event-catalog bubble carving this doc treats as the live mechanism is now a
**debug overlay only** (`rebuildBubblePlacements` gates on
`bubbleViewIntensity`; `dustParticleCloud.ts`'s header: "No cavity carving
here any more"). The live dust is `buildDustParticleCloud` seeded from the SF
map (`gas × oldActivity`), with NO cavity mechanism at all yet — which makes
the Tier-1 rim/wall/floor gaps _stronger_, not weaker: cavities and rims are
both waiting on the map (see [06-ca-dust-channel-sketch.md](06-ca-dust-channel-sketch.md)
and [07-sprite-seeding.md](07-sprite-seeding.md)). The HII knot tier still reads the
event catalog.

## Direct answers to the three questions

**Bubble formation.** The model carves bubbles; the image is _made of_ bubble
walls. What's missing is not holes but **mass conservation**: real shells hold
8–30× the column of their interiors (Barnes 2023, verified), so the bright
filament web IS the swept-up rims, shared between adjacent cells. Negative
splats delete dust and enrich nothing, so adjacent model bubbles produce two
holes in a flat bed, not one bright shared wall. Secondary gaps: sphericity
(real q≈0.8–0.9, shear-aligned), accelerating `age^2.5` growth vs uniformly
decelerating physics, and a 120-largest budget against a measured 1,694-bubble
population whose small end carries the close-view texture.

**Cloud-forming regions.** Two real gaps. (1) The PHANGS lifecycle
decorrelation (Chevance 2020, verified): gas/dust reservoirs and SF activity
are ANTI-correlated at 100–300 pc — clouds spend 75–90% of a 10–30 Myr life
inert and dark, then are dispersed within 1–5 Myr of lighting up. A dust
density that reads _accumulated activity_ paints dust where the stars are,
which is closest to where the dust is currently being destroyed. The CA's
existing `gas` channel is the natural home for the fix — but its timescale
knob (`gasRegen`) is currently tuned as a void-contrast control, not a
lifecycle. (2) Condensation statistics: real column PDFs are lognormal with a
sparse high-contrast power-law tail (opaque cores, A_V~10) — a single fractal
modulation can't produce "mostly modest texture, rarely very opaque".

**Supernovae.** The model has no SN concept, and mostly doesn't need one —
EXCEPT for the one population nothing else can supply: **cavities with no
visible trigger** (86% of HI holes in the Rhode 1999 Holmberg II test;
runaway-OB displacement of hundreds of pc; Type Ia from the Gyr-old disc
population). These are the small holes tessellating the deep interarm. The
event catalog is arm-ridge-only by construction, so the model's interarm is
clean where the image is foam. SN grain/PAH destruction also licenses cavity
floors _darker than their remaining column_ — a pure density model
under-darkens exactly where the image is blackest.

## Tier 1 — outside the current architecture (new machinery class)

1. **Swept-rim mass conservation / shared-wall foam.** The identity-defining
   feature. Hook exists: dust.md's network architecture already names
   "negative bubble splats with swept rims" — unbuilt. A rim splat sized by
   swept volume × ambient density gets the per-bubble part; wall SHARING
   between neighbours additionally needs either enough cavity number density
   that rims abut (see gap 8) or the CA map to carry the foam and the splats
   only the marquee cavities.
2. **Emission-side dust.** MIRI brightness = qPAH × column × heating, and the
   renderer has only column; extinction and emission morphologies agree on
   only ~40% of sightlines (Thilker 2023, verified). For the MW goal the
   absorption screen is the right primary; but any "JWST view" that presents
   the column map directly will read flat. Cheap proxy: multiply presented
   emission by a blurred activity/heating channel, with a near-source
   suppression term (PAH destruction → bright rim, dark interior).
3. **Reservoir/activity decorrelation.** Needs a slow (~cloud-lifetime)
   reservoir field driving dust, with activity carving a delayed, small-offset
   deficit — a second timescale in the CA, not a new subsystem, but a real
   re-keying of "the SF map is the dust" (e2d07d54 made dust = activity;
   physics wants dust ≈ gas-reservoir minus recent-activity).
4. **Trigger-less cavity population.** Interarm foam needs cavity seeding
   decoupled from the arm event catalog (field SNRs, runaways, Ia). The CA's
   `baseIgnition` gives the _map_ some interarm structure, but the discrete
   cavity/knot tier has no off-arm channel at all.
5. **Kinematics and the third dimension.** Turbulent power spectra, vertical
   blowout/chimneys, fountain venting: out of scope as physics; the detail
   tier's calibrated noise is the honest fake. (Blowout matters more for the
   inside-the-MW view than for face-on galaxies.)

## Tier 2 — capturable by re-wiring existing pieces

6. **Knots on rims** (strongest correlation in the image; Barnes: 80% of young
   stellar mass in the shell, offset 50–100 pc _inside_ the dust wall). The CA
   already produces the causality — fronts ignite at void edges. The gap is
   that `sfEventCatalog` rolls positions/ages independently. Sampling the
   discrete events FROM the map's age/activity channels is already staged in
   sf-map.md ("replace `gapSkipped`") — this observation makes it the
   highest-leverage single change on the list.
7. **Non-circular cavities.** Elongate splats along the orientation field /
   local shear the branch already computes (verified PA-alignment statistics);
   add an azimuthal rim-strength profile (compression side vs ragged side).
8. **Cavity population size.** Budget keeps the 120 LARGEST; the image's foam
   texture is carried by the small end of the −2.2 law (1,694 catalogued ≥6 pc
   in NGC 628). Close views need either a view-dependent budget or the CA map
   carrying the sub-100 pc end as texture.
9. **`age^2.5` double duty.** One exponent currently serves both the size
   distribution (its actual job, per its comment) and implicitly an R(t) law
   (accelerating; physics decelerates at every stage). Under uniform age
   draws it yields `dN/dR ∝ R^-0.6` — right sign, ~1.6 dex shallower than the
   −2.2 target. Co-design the age draw and the size law; do NOT just swap the
   exponent (that inverts the distribution — see supernovae.md §4 correction).
10. **Bead spacing.** Quasi-regular 300–800 pc (radius-dependent) spacing along
    arm ridges vs the current per-step independent Bernoulli (maximum-variance
    shot noise — a defect sf-map.md already names). Poisson-disc-style spacing
    or map-derived placement both fix it.
11. **Cavity floors.** Residual translucent density (never zero) + extra
    darkening beyond the mass budget (PAH destruction), with a steeper edge
    profile for young HII cavities than for old relic bubbles (Egorov 2023's
    threshold-like destruction vs a density taper).
12. **Splat amplitude statistics.** Two-population amplitudes (broad
    lognormal bulk + sparse power-law tail of near-opaque ridge/core splats)
    instead of one fractal field.
13. **Near-arm feather gradient.** CO feather columns fall 5–10× within a few
    hundred pc of the lane — a steep across-ridge falloff the current smooth
    arm-forcing profile won't produce emergently.

## What the literature says the design already gets right

- **Arms as forcing, never emergent** — TIGRESS's verdict ("arms concentrate,
  not trigger"; <2× global enhancement) independently confirms the branch's
  own load-bearing decision in sf-map.md.
- **Modest arm/interarm contrast** (1.5–2.5× in cloud populations) — a smooth
  `armFactor` CAN deliver this; no dichotomy machinery needed.
- **Negative splats are directionally correct** — evacuation and grain
  destruction both end in a dark cavity; the mechanism label is wrong but the
  pixel outcome is right (until rims and floors, above, are wanted).
- **Nesting needs no machinery** — the measured 31% nested rate is only 3.2×
  chance; independent placement at realistic number density gets most of it,
  and the CA's percolation supplies the rest of the causal structure.
- **The −2.2 size-law anchor is confirmed exact** (Watkins 2023 fetched:
  1,694 bubbles, 6–552 pc, p = −2.2 ± 0.1, 31% nested) — the branch's cited
  numbers survive verification.
- **A "second gas channel" was the right instinct** — sf-map.md adopted the
  two-component star+gas variant of SSPSF; the lifecycle literature (gap 3)
  says that channel, with a longer timescale, is also the dust-placement
  truth.

## One cross-cutting observation

Five gaps (1, 3, 6, 8, 11) share a root: **two placement systems exist — the
CA map and the discrete event catalog — and they do not read each other.**
The map has causality (fronts, voids, ages) but no discrete features; the
catalog has features (glows, cavities) but no causality. Every correlation
the image exhibits (knots on rims, nested cavities, walls between voids,
young-inside-old) lives exactly on the seam between them. sf-map.md's staged
plan (events sampled from the map) closes most of this with one change; the
research here mostly sharpens its priority and supplies the acceptance
statistics.
