# Beyond the foam: remaining realism levers, with implementation hints (2026-08-03)

Closing notes of the M74 research pass. Everything here is NEW relative to
[05-renderer-gaps.md](05-renderer-gaps.md) — past the ISM foam, the biggest
remaining wins are population-level, light-transport and methodological, not
more sub-grid dust physics. Ordered within each group; the priority table at
the end ranks across groups by realism-per-effort. File references are to the
`milky-way-analytic-field` branch @ `133295cf`; verify wiring before use —
the branch moves fast.

---

## A. Population & geometry — what the eye checks first

### A1. Break the symmetry (the #1 procedural tell)

**Why.** Nothing reads "generated" faster than two identical arms. Real
discs: arms differ in strength and pitch, bifurcate (M74's own arms branch),
and are lopsided — an m=1 (one-sided) distortion is near-universal in
late-type discs (RECALLED, uncontroversial; easy to confirm against any
atlas image).

**Implementation.** All params-level, no new subsystems:

- Per-arm amplitude/pitch/fade jitter: `GalaxyFieldGeometry.arms` is already
  a per-arm record array (`GalaxyFieldArmRecord`) — the seeds exist, the
  PRESETS just don't spread them. Add a `armVariation` scalar that scales
  seeded per-arm deltas so one slider controls "how identical".
- One branch point: a second ridge forking off one arm at a seeded logR,
  inheriting the parent's frame — cheapest as one extra entry in
  `geometry.arms` with `armStartRadius` at the fork and a shared base angle,
  so every consumer (forcing texture, event catalog, arm cloud) gets the
  branch for free. No consumer may special-case "branch" — it is just an arm
  whose start radius is large.
- Lopsidedness: an m=1 term is ONE cos(θ − φ₀) modulation on disc surface
  density and arm forcing amplitude. Keep it a few percent; it should be
  felt, not seen.

**Perf.** Zero per-frame; a handful more components.

### A2. The across-arm age sequence

**Why.** A grand-design arm is an assembly line, and the eye knows the
ordering from every textbook photo: dust lane on the upstream (concave)
edge → HII knots mid-arm → blue young clusters trailing downstream — and the
ordering MIRRORS across corotation (upstream flips side). Lane-to-tracer
offsets ~150–315 pc (SECONDARY, already in dust.md's anchors).

**Implementation.** The pieces exist; nothing orders them:

- Which side is "upstream" is known analytically: the sign of
  `Ω(r) − Ω_pattern`, i.e. `sfMapShearTexels`'s own sign. Expose it as a
  helper (`upstreamSign(radius)`), don't re-derive it per consumer.
- Dust lane: offset the dust tier's ridge sampling by
  `−upstreamSign · laneOffset(r)`; young HII events: 0; the arm star cloud
  (`armParticleCloud`): `+upstreamSign · clusterOffset(r)` with a small age
  ramp if the cloud ever carries per-sprite colour.
- The offsets should FADE near corotation (they are shear-driven — reuse the
  `armFluxRef` saturate the automaton already applies, same physics).

**Perf.** Zero per-frame; placement-time offsets only.

### A3. The Milky Way bar's dust lanes (MW-specific marquee feature)

**Why.** Two nearly-straight, offset dust lanes along the bar's leading
edges are THE signature dust feature of barred galaxies — and the MW is
barred. Any face-on MW view (the tour will produce one) without them reads
wrong to anyone who has seen a barred spiral.

**Implementation.** `computeBarGeometry.ts` exists; the lanes don't.
A bar lane is well-approximated as a straight segment from near the bar end
toward the nucleus, offset toward the bar's LEADING side (leading = rotation
direction; the pair is point-symmetric). Cheapest: two authored elongated
dust components (the 2.5D detail-splat vocabulary already supports
super-Gaussian lane edges) parameterised off the bar's length/angle so they
track the bar params. Slight inward curl at the inner end (they feed the
nuclear region). Do NOT couple them to the SF map — bar lanes are shocks in
the bar potential, not SF debris; they belong to the analytic tier the way
the arm lane did.

**Perf.** Two splats.

---

## B. Light transport — why the current lanes look like ink

### B1. A scattering floor under the extinction screen

**Why.** Dust scatters as much as it absorbs (optical albedo ~0.5); forward-
scattered disc light partially refills lanes. Pure-absorption renderings
overestimate lane darkness — this is the standard radiative-transfer result
and the reason SKIRT-class codes exist (RECALLED, safe). Matters most
edge-on, i.e. exactly the MW-from-inside view.

**Implementation.** In the one place attenuation is applied (`splat.wesl`'s
dust-map read): `E_out = E·T + ambient·(1−T)·albedoTint`, where `ambient` is
a CHEAP local light estimate — the analytic field's own value at the
disc-plane point, or even a per-radius lookup of mean disc brightness. The
albedo tint is bluish (scattering is bluer than the CCM89 absorption is
red). One knob (`scatterFloor`), default small. The failure mode to avoid:
making it a flat additive fog — it must be proportional to (1−T) so clear
sightlines gain nothing.

**Perf.** A few ALU per dust-attenuated fragment; no new passes. Measure
with `npm run perf` anyway (fragment-bound renderer).

### B2. Chromatic arm contrast

**Why.** Old stars barely respond to the density wave (~10–20% contrast in
NIR) while blue light shows 50%+ — arm contrast is strongly chromatic. Equal
contrast across the palette is what makes arms look painted on.

**Implementation.** `armExcessFlux` is debited from the disc (arms.md) —
give the debit and the credit different colours: the arm term bluer, the
disc correspondingly redder, net flux per band conserved by construction.
This is a colour split of an existing scalar, not a new term. Anchor the
ratio loosely (arm/interarm contrast ratio B vs K ≈ 2–3×, SECONDARY).

**Perf.** Zero — same component count, different colour constants.

### B3. Diffuse ionized gas (DIG) veil

**Why.** 30–50% of a galaxy's Hα is NOT in HII regions (SECONDARY, standard
result) — a faint haze leaking around knots and tracing the arms. Knots
alone read as LEDs on black.

**Implementation.** Reuses S4's machinery ([07-sprite-seeding.md](07-sprite-seeding.md)): a
low-amplitude emission term sampling a BLURRED copy of the SF map's activity
channel (a mip level suffices), tinted Hα-pink in the optical view, added in
the field pass. Amplitude a few percent of knot flux, calibrated by the
30–50% integrated split, not by eye. Guard the beaded-lane rule: sample at
the consumer's resolution.

**Perf.** One texture sample in a pass that already runs.

---

## C. Presentation — when the target is "the photo", not "the galaxy"

### C1. Instrument signature for the JWST view

**Why.** A large share of "looks like the JWST image" is the instrument, not
the astrophysics: six-spike diffraction on bright points, band-mapped false
colour, PSF-limited fine detail. Chasing that with physics is wasted effort.

**Implementation.** Post-only, gated to the JWST debug view: (a) star-shaped
convolution on pixels above a luminance threshold (or sprite-based spikes on
the HII knots — cheaper, they are already discrete); (b) a false-colour LUT
mapping the dust/emission channels to the F770W/F1130W/F2100W palette
(olive/orange/crimson) instead of a generic palette; (c) a slight blur to
the map-detail term matching MIRI's ~15–30 pc PSF at the chosen zoom.
None of this touches the optical view.

**Perf.** Debug-view-only; irrelevant if gated.

---

## D. Methodology — the item that compounds all the others

### D1. Compare at matched physical scale, and by statistics

**Why.** MIRI resolves ~15–30 pc at M74's ~9.8 Mpc. Eyeballing the tool
against the full-resolution image tunes the wrong frequency band — the
renderer will be pushed to produce detail the reference cannot even confirm,
while mid-frequency errors (the ones that matter) hide.

**Implementation.**

- Matched-scale comparison: downsample BOTH sides to a common pc/pixel
  before comparing. The tool knows its world scale (`pcToUnits`); the image
  side is a one-time constant (M74 distance + pixel scale).
- Objective targets for `matcher/autoFit` (already exists, already optimises
  presets): (a) the 2D POWER SPECTRUM of the dust/JWST view vs the M74
  image over the 50 pc–2 kpc band; (b) the COLUMN-DENSITY PDF — lognormal
  bulk + power-law tail ([03-clouds-and-dust.md](03-clouds-and-dust.md) §3). Both are a few dozen lines
  on the existing readback path, and both turn "does it look right" into a
  regression that survives tuning sessions. Fit the STATISTICS, never the
  pixels — the goal is a galaxy of the same texture class, not a copy of
  M74's particular arm layout.
- Keep the M74 reference crops (full frame + the three used in
  [01-image-morphology.md](01-image-morphology.md)) in the repo or the tool at fixed pc/pixel, so every
  future tuning pass compares against the same ground truth.

**Perf.** Tool-side only.

---

## Priority: realism gained per effort spent

| Rank | Item                                       | Effort | Where                            |
| ---- | ------------------------------------------ | ------ | -------------------------------- |
| 1    | A1 asymmetry (per-arm jitter, branch, m=1) | S      | presets/geometry                 |
| 2    | A3 MW bar dust lanes                       | S      | authored splats off bar geometry |
| 3    | A2 across-arm age sequence                 | M      | placement offsets, shear sign    |
| 4    | B1 scattering floor                        | S      | splat.wesl attenuation           |
| 5    | B3 DIG veil                                | S      | field pass + blurred activity    |
| 6    | B2 chromatic arm contrast                  | S      | colour split of armExcessFlux    |
| 7    | D1 metrics harness                         | M      | matcher/autoFit                  |
| 8    | C1 instrument signature                    | S      | JWST view post                   |

D1 ranks below the visual items only in immediate payoff — it compounds
everything above it and should land before any long tuning campaign. All
items are per-frame-cost-neutral except B1 (a few ALU, measure) and C1
(debug-gated).
