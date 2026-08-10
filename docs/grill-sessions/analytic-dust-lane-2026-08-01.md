# Grill Session: Analytic global dust absorption lane — 2026-08-01

Source: dust step of the Milky Way realism roadmap (task list #18), on branch
`milky-way-analytic-field` (PR #539). Follows the research doc's §8 result that
emission-with-self-absorption has no closed form, so dust must composite as a
screen, not mix into the emission integral.

Goal: give the splat-rendered Gaussian-mixture field a physically grounded dust
lane that works for the Milky Way and for arbitrary survey galaxies. The user's
standing instruction for this whole workstream: build dust up step by step and
start subtle — earlier experiments tended toward too much dust.

Literature grounding done before the session (verified via search, 2026-08-01):
dust discs in spirals are ~half the stellar scale height and ~1.4–1.75× the
stellar scale length, with central face-on τ_V ≈ 0.5–1 (Xilouris et al. 1999;
Bianchi 2007; De Geyter et al. 2014 CALIFA mean 0.76 ± 0.6). The Milky Way's own
dust layer is thinner still: ~100–134 pc scale height against the ~314 pc
stellar σ_z (Drimmel & Spergel 2001: h_R 2.26 kpc + arm dust component;
Misiriotis et al. 2006: h_R 5 kpc, h_z 100 pc; two-disc splits find a thin
60–200 pc molecular-tracing disc plus a 300–800 pc thick one).

---

## Q1: Compositing mechanism

**The question:** How does the global dust lane attenuate the emission splats?
This is the root decision — everything else (geometry, cost, extras) hangs off
the mechanism.

**Considerations:**

- **Option A (per-splat front/behind split):** In `splat.wesl`, each emission
  splat's fragment already integrates its Gaussian along the ray with erf
  bounds. Add a loop over N dust Gaussians: each dust component's full ray
  column τ is closed form (same erfc machinery), and the dust column-weighted
  centre along the ray gives a split point t_d. Then
  `E_out = E(0→t_d) + T·E(t_d→∞)` with `T = exp(−τ_column)` per channel. Exact
  for a thin dust layer; captures near-side/far-side dust-lane asymmetry on
  inclined views; a bulge splat behind the plane dims while the near disc face
  doesn't — the differential that makes an edge-on rift read as a lane. Cost
  ~1 exp + 1 erfc per dust comp per fragment.
- **Option B (multiplicative screen pass):** Render dust to its own target,
  multiply the field texture once at the galaxy's depth. Simpler, but one depth
  for the whole galaxy — no near/far asymmetry, and edge-on it degrades to
  "darken everything", exactly the flat overdone-dust look being avoided.
- **Option C (true coupled absorption):** Not closed form (research doc §8, the
  e^{−erf} integrand); requires marching. Out.

**Decision:** Option A. The split is per emission component, evaluated in the
splat fragment shader.

## Q2: Dust geometry — frozen ratios or independent parameters?

**The question:** Is the dust disc's shape derived from the stellar disc by
frozen measured ratios, or does it get its own tunable parameters?

**Considerations:**

- **Option A (frozen physical ratios):** Radial profile = the dimensionless
  `DISC_SIGMA_RATIOS` Gaussian fit evaluated at h_dust = 1.5 × h_disc; vertical
  σ = 0.4 × diskHeight. Zero new geometry knobs; only τ_V exposed. Matches the
  de-featuring lesson from the warp rings.
- **Option B (independent dust parameters):** Own scale length, height, amount —
  more faithful, more adaptable across galaxy generations, at the cost of more
  surface area.

**Decision:** Option B — the user wants substantial dust tunability and
adaptability across different galaxy generations. The ratios from the
literature become *defaults*, not frozen constants.

## Q3: Which parameters, and where do they live?

**The question:** The exact parameter set, and its placement relative to the
established seam: `GalaxyParams` is per-galaxy generation state (presets pin
it, randomize rolls it, the survey map will draw it); `GalaxyFieldTuning` is
global model tuning.

**Considerations:** Dust amount and shape vary galaxy-to-galaxy (dusty Sc vs
near-transparent S0), so they belong in `GalaxyParams`. Ratios-to-stellar-disc
rather than absolute values keep one generation's dust adaptive when its disc
changes. All three chosen numbers are directly measured quantities — nothing
invented. Deliberately excluded this pass: a radial-profile/central-hole knob
(real but a later refinement) and any clumpiness knob (that's step 3 of the
dust sequence).

**Decision:** Three parameters in a nested `dust` section of `GalaxyParams`
(`dust: GalaxyDustParams`, one type per file):

- `tau` — central face-on τ_V
- `scaleLenRatio` — h_dust / h_disc(light), default 1.5 (measured 1.4–1.75)
- `heightRatio` — σ_z,dust / diskHeight, default 0.4 (measured 0.25–0.75)

The survey map later ties `tau` to morphological class; three new rows in its
V/S/GAP range table.

## Q4: Chromaticity

**The question:** How wavelength-dependent is the absorption — frozen physical
extinction law, or a tunable reddening knob?

**Considerations:**

- **Option A (frozen R_V = 3.1 Galactic law):** τ per channel =
  `tau × [0.78, 1.0, 1.32]` for R/G/B (~600/550/450 nm). Near-universal across
  normal galaxies; deviations (Calzetti, LMC/SMC) matter mostly in the UV, not
  in three visible channels. Zero knobs: τ sets how much, physics sets how red.
- **Option B (tunable reddening strength):** A dial that invites hand-tuned
  "dust drama"; only needed if an exotic preset demands a greyer/steeper law.

**Decision:** Option A. Transmittance T is a vec3 through the splat path (the
research doc's RaySegment sketch anticipated this). M82 note recorded in the
session: starbursts' greyer effective law (Calzetti) arises from clumpy mixed
geometry, not different grains — since we model geometry explicitly, greying
should partly emerge once patchiness and mixing land; if it doesn't by the M82
preset, that's the named reason to add a law knob.

## Q5: Does the global dust lane follow the warp?

**The question:** Dust rides the gas, and the warp is strongest in gas — but
origin-centred Gaussians cannot warp (research doc §11.1's shear-on-origin
failure).

**Considerations:**

- **Option A (flat dust, step 1):** The warp is identically zero inside
  `warpStartRadius` (~10 kpc MW), where nearly all optical depth lives — even
  with h_dust ≈ 3.9 kpc the column at warp onset is ~8% of central. Visible
  error: a slightly-too-straight lane at the faint outer edge of an edge-on
  view.
- **Option B (warped dust band):** Mirror `pushWarpedOuterDisc` with dust ring
  blobs. Correct, but multiplies the per-fragment dust loop for a region whose
  absolute τ is under 0.05.

**Decision:** Option A for now; revisit only if the flat lane visibly clashes
with the warped emission at the outer edge in the visual pass.

## Q6: Do the background extras get dust in step 1?

**The question:** Extras must eventually honour the analytic model (standing
user requirement for many-galaxy perf testing), and attenuation is strictly
per-galaxy — an extra's dust must never darken the primary.

**Considerations:**

- **Option A (primary-only this pass, per-galaxy layout from day one):** The
  packed dust buffer and instance plumbing carry (dustOffset, dustCount) per
  galaxy; the primary is galaxy 0. Extras light up in a small follow-up with
  zero rework. Calibrating dust while twenty random galaxies also change makes
  the visual pass ambiguous; the perf question is better measured against a
  settled look.
- **Option B (everything at once):** Saves a commit, muddies both the visual
  calibration and the perf attribution.

**Decision:** Option A.

## Q7: Milky Way preset numbers and slider ranges

**The question:** The calibration anchor and defaults. Key insight stated up
front: modest face-on transparency and a strong edge-on equatorial rift are the
same τ seen from two angles — central face-on 0.5 gives ~0.2 through-disc at
the solar circle but a many-times-higher edge-on column. No need to inflate τ
to get a visible lane.

**Decision:** MW preset pins `dust: { tau: 0.5, scaleLenRatio: 1.5,
heightRatio: 0.35 }` — τ at the floor of the measured 0.5–1 range per the
build-up-slowly instruction; heightRatio reflects the MW's notably thin dust
layer. Slider ranges: tau 0–2.5, scaleLenRatio 0.8–2.5, heightRatio 0.15–1.0.
Randomize draws inside the measured sub-ranges (tau 0.2–1.0, ratios as
quoted), not the full slider spans — sliders explore, the randomizer stays
plausible. Step-1 acceptance bar: face-on barely changes; the payoff view is
inclined/edge-on (rift + near-side reddening). If face-on visibly darkens, the
calibration is wrong.

Session note recorded with this question: the user reminded that galaxies
should eventually generate in real time while navigating (the sprite generator
lived in a compute shader for this reason). `buildGalaxyFieldMixture` (+ dust)
must stay cheap per galaxy; a GPU-side mixture builder is the escape hatch if
CPU generation ever becomes the bottleneck.

## Q8: Legacy dust's fate, and who owns the name `dust`

**The question:** A generator-era dust system already exists
(`dust`/`dustNoise`/`dustNoiseScale`/`dustRing`/`dustRingWidth`/
`dustRingStrength`, model.js heritage; MW preset sets `dust: 0.5`), and
`GalaxyParams.dust` collides with the new section's name.

**Considerations:** Legacy dust belongs to the sprite path and dies when the
star bag dies — no investment. Analytic dust attenuates only analytic emission,
so A/B comparisons stay honest. For the name: protecting a doomed field by
uglifying the surviving API (`dustDisc`) is backwards.

**Decision:** Rename the legacy scalar `dust` → `spriteDust` (mechanical, via
the refactor tool; heritage-table attribution kept). The new section owns
`dust`. The legacy dust UI section is renamed to read as legacy and gains a
toggle pill so the two dust systems can be compared on the same galaxy.

## Q9: Analytic DUST section UI seam and enable

**The question:** Where the new controls live and how enable works.

**Decision:** A DUST section under the ANALYTIC MODEL group, sibling of FLUX
FIELD and ARM OVERDENSITIES. Master pill wired to a new
`GalaxyFieldTuning.dustEnabled` (default on; off skips the shader dust loop
entirely, not just τ=0 — consistent with `discEnabled`/`armsEnabled` and the
opacity-0-means-no-work rule). The three sliders edit `params.dust.*` —
per-galaxy values, so they participate in randomize-everything (measured
sub-ranges per Q7), unlike tuning sliders. Established seam holds: randomize
rolls the galaxy, never the model tuning.

---

# Part 2 — the filament/bubble network (same day, second session)

Asked for by the user after seeing the step-1..3 roadmap: design the full
PHANGS-style network now so it can be implemented in the same push. Two
standing constraints arrived during this session: (1) the user has seen JWST
M74/NGC 628 — the bar is sharp lanes and fine detail, "I'm afraid you'll come
back with a blobby mess"; (2) every builder must be movable to a Worker or a
GPU compute pass later (real-time generation while navigating), so placement
code stays pure `(params, geometry, seed) → flat data`, no engine state, no
per-frame CPU work.

## N1: Scaling architecture — dust gets its own splat pass

**The question:** step 1 evaluates ~4 dust Gaussians analytically inside every
emission fragment. A network is hundreds of components — a per-fragment
multiplier the emission side escaped by splatting. How does the network scale?

**Considerations:**

- **Option A (screen-space dust-column map):** splat dust components into an
  offscreen target accumulating (τ_V, τ·t̄) per pixel; emission fragments
  sample it once — t_d = moment ratio, T = exp(−τ·rgbRatios), split as
  designed. Dust count decouples from emission cost; negative splats (bubbles)
  become possible; the JWST view mode is literally this target through a
  palette. Caveat: per-screen, so per-galaxy attenuation needs the analytic
  loop anyway — extras keep it; the map serves the primary (an LOD split, not
  a hack).
- **Option B (analytic loop only):** caps the network at a few dozen comps;
  bubbles effectively out.

**Decision:** A. The user's sharpness worry is answered by the architecture
itself: (1) splat cost = covered area, so thin/sharp is the CHEAP direction;
(2) the map is rasterized, not analytically integrated — a detail splat can
evaluate ANY 2.5D density at its ray's disc-plane crossing (super-Gaussian
sharp-edged lane profiles, fractal along-lane modulation, hard bubble rims), so
frequency content is bounded by pixels, not component count; (3) the map runs
at FULL render resolution — dust is where the high frequencies live. Division
by view angle: the smooth Gaussian lane owns edge-on (detail is foreshortened
there anyway); the plane-crossing detail tier owns face-on/inclined and fades
by incidence where its approximation degrades.

## N1b: LOD (user asked: "could have LOD splat passes as well?")

Four mechanisms adopted: per-tier resolution (smooth half-res, detail
full-res); width-clamped splats with COLUMN-conserving amplitude (the star
renderer's clampFluxScale identity — receding filaments fade correctly instead
of shimmering); noise-octave band-limiting against projected pixel scale; and
the load-bearing one — **zero-mean detail tiers**: each feature class encodes
fluctuation around the tier below (the lane's amplitude carries its beads' and
gaps' azimuthal average; beads/gaps are paired excess/deficit), so instance-
culling sub-pixel features is unbiased and the far view converges exactly to
the step-1 analytic lane. Same ledger discipline as the arm-excess disc debit,
applied recursively. Built in from the start — hard to retrofit.

## N2: Feature inventory and priority

Four classes, ordered by visual impact (user: "highest visual impact first"):
1. **Arm dust lanes** — sharp-edged ridges on the arms' inner edges, (1−age)
   weighted, along-lane fractal modulation.
2. **Spurs/feathers** — quasi-regular filaments peeling into inter-arm space;
   they are what makes inter-arm space read as structured (why they outrank
   bubbles).
3. **Bubbles** — negative splats + swept-up rims, SF-driven, on/near young
   arms.
4. **GMC beads** — dark knots strung along lanes and spurs.

## N3: Shared star-formation event catalog

**Decision (user: "a, great idea"):** one seeded per-galaxy SF-event catalog
(pure function: seed → array of {arm, logR, across-offset, age, strength}),
consumed by the dust network now (old events = bubbles, rim strength by age)
and by #20 later (young events = HII knots at older events' rims) and
eventually the M82 preset. One placement truth so cavities and glow correlate
the way PHANGS shows, instead of two independent sprinkles. Rejected: private
per-feature placement — visibly uncorrelated once #20 lands, and reconciling
later re-seeds features the user has already approved.

## N4: Knob surface

Masters (randomize rolls these; physical anchors): `armContrast` (dust
concentration into lanes, molecular arm/interarm ~2–5 — deliberately larger
than the stellar K≈1.3), `sfActivity` (event-catalog rate; later tied to
colour by the survey map), `texture` (zero-mean small-scale amplitude),
`spurStrength`. Per-feature refiners (user asked for feature-level tuning; all
are ×measured-default scalers, 1.0 = the literature): `laneWidth`,
`laneOffset` (density-wave shock displacement from the stellar ridge),
`spurSpacing`, `spurLength`, `bubbleScale` (power law itself frozen),
`bubbleRimStrength`, `beadShare`. Not exposed: bubble size-distribution slope,
spur spacing law's form, noise octave counts (anti-aliasing, not look). UI: a
DUST NETWORK section beside DUST under ANALYTIC MODEL.

## Measured anchors for the network (fetch-verified 2026-08-01)

From the literature pass (V = primary-verified, S = secondary): spur spacing
300–800 pc quasi-regular (S; theory 0.5–1 kpc, Kim & Ostriker family), pitch
~60° to the arm (S), lengths 1–5 kpc (S), present in 83% of galaxies WITH a
well-defined primary dust lane vs 20% overall (V, La Vigne, Vogel & Ostriker
2006 ApJ 650, 818) — so spurs GATE ON LANE STRENGTH, not type. Bubbles:
1694 in NGC 628, radii 6–552 pc, size power law −2.2±0.1, 31% nested, radii
grow downstream of the arm, elongated along it (all V, Watkins et al. 2023
ApJL 944, L24); HI holes 100 pc–2 kpc, slope ≈−2.9 (V, Bagetakos et al. 2011
AJ 141, 23). GMC beads: diameters ~40–100 pc (S), Σ ≈ 170 M⊙/pc² (S, Solomon
et al. 1987), central A_V ~10 (S via Bohlin conversion) — cores genuinely
opaque; arm clouds 2.5× interarm mass (V, Rosolowsky et al. 2021). GAP: no
primary-verified dust-lane WIDTH; lane-to-tracer offsets ~150–315 pc (S only).
laneWidth default is therefore an eyeball-vs-M74 call, flagged honest.

---

## Step-1 scope (as dispatched)

Flat analytic dust lane: `GalaxyDustParams` + `spriteDust` rename + dust
mixture (Gaussian fit at h_dust, single vertical σ) + splat-shader front/behind
split with vec3 transmittance + DUST section + legacy dust section
rename/toggle. Primary galaxy only, calibrated subtle. Arm-edge dust re-seed
and patchiness are steps 2 and 3.
