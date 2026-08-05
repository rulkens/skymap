# The dust needs a simulation, not a noise field (decision, 2026-08-02)

**MEASURED, from the branch's own history.** `81cd2da0` built spurs, bubbles
and GMC beads as explicit authored features; `d77ebc27` removed that tier three
days later in favour of the volumetric particle cloud. Neither hand-authored
features nor clustered stochastic placement produced ISM _structure_ — the
current dust reads as Gaussians scattered near the arms.

**INFERRED (design analysis).** fBm cannot close the gap, and the reason is
specific: it has no causality and no shear. Spurs are the sheared remnants of
instabilities in the arm's gas ridge, which is why the measured spacing is
quasi-regular (300-800 pc, [measured for dust](dust.md)) rather than scale-free. A noise field can
imitate the texture but not the arrangement, and — the load-bearing part — it
cannot correlate a dust cavity with the glow that blew it, because three noise
fields have no shared history.

**DECISION: a stochastic self-propagating star formation (SSPSF) cellular
automaton on a log-polar grid, arms supplied as a forcing term.**

**LITERATURE, verified 2026-08-02.** Gerola & Seiden 1978 (ApJ 223, 129),
generalizing Mueller & Arnett 1976. A percolation model: each generation of
star formation triggers its neighbours, and differential rotation shears the
result into material arms. Implementation shape from the same source —
concentric rings subdivided azimuthally into **equal-area** cells (so cell
count per ring grows with radius, which a uniform grid gets wrong), at most one
active cell per step, and ring shear that changes a cell's neighbour set over
time.

**LITERATURE, verified, and the reason this is a detail generator and not an
arm generator:** SSPSF explicitly does NOT produce grand design. It produces
FLOCCULENT arms, continually created and destroyed. **A future reader will be
tempted to get the spiral arms out of this simulation. It cannot supply them.**
Arms enter as given forcing; what emerges is the structure hanging off them.

**LITERATURE, verified.** The original model's known deficiency is that it
tracks only stars; the documented fix is a two-component star+gas system whose
feedback regulates and stabilises the propagation. This is why the map carries
a gas channel rather than an activity channel alone. Jungwiert & Palous 1994
add anisotropic propagation probabilities to span morphologies — the hook the
survey-to-parameters map will want.

**INFERRED (derivation, not measured): the shear term is `Omega(r) -
Omega_pattern`, never `Omega(r)`.** Shearing by the bare angular velocity winds
the whole disc one way. Relative to the pattern the shear is zero at
corotation and reverses sense across it, which is what makes spurs trail
oppositely inside and outside. In log-polar coordinates this is a per-row
angular offset — one lerp between two texels per row per step — rather than a
full-field advection resample, which is what makes the step cheap and exact.

**Architecture (decided).** GPU compute pass produces the map; ONE async
readback per galaxy generation; the existing CPU builders take the sampled map
as an extra data argument. The purity invariant survives verbatim — a map is
data, so `(geometry, params, seedMap, seed) -> flat data` is still pure. What
this must never become is a per-frame readback, or a CPU mirror of the CA
maintained alongside the GPU one; two implementations of the same automaton
would drift within a week.

**Staging, with the gate stated up front.** The compute pass and a tool overlay
land FIRST, consumed by nothing. If the automaton does not visibly beat what is
already on screen, it dies there having cost a shader and an overlay. Only then
does dust placement read it, then `sfEventCatalog`'s `gapSkipped` coin flip
([shot noise's](sampling-and-noise.md#shot-noise--the-correction-that-matters-most) maximum-variance placement) gets replaced. Bubbles and HII need no change
— they key off the age axis the automaton now supplies with structure.

**Three landmines this design has to route around**, all already recorded
elsewhere in the repo: a new render target with no `frameProgram` step opens no
pass and fails silently; the shader belongs under `src/services/gpu/shaders/`
because the post chain has been shared with the tool since #521; and the map
must be sized to its CONSUMER's rate, not the canvas — [the beaded-lane debugging chain](dust.md#the-beaded-lane-debugging-chain-2026-08-01--read-before-touching-map-resolutions)'s trap
was exactly this shape.

## An exact-equality test against an interpolated value killed percolation

**MEASURED, user's first tuning pass, 2026-08-02.** `spread` had to reach
**~0.56** before anything visible happened; the seeded 0.18, taken from the
classical percolation literature, produced structure that died within a few
steps. The pre-fix calibrated set was steps 170, baseIgnition 0.002, spread
0.56, refractorySteps 7, gasRegen 0.06, armForcing 0.15, corotationRadius 7.9,
shearRate 0.16.

**REFUTED, and recorded because the wrong answer was plausible.** The first
hypothesis was gas starvation — a cell leaves the refractory window with only
`refractorySteps * gasRegen` of its gas restored (0.42 at those values), so
ignition would be competing against a floor the classical model lacks. The
user ran the decisive test: `gasRegen` 1.0 with `spread` 0.18 gives no
structure at all. Gas was never the suppressed term.

**MEASURED, the real cause, found by reading the shader.** The neighbour test
was `neighbour.y == 0.0` — an exact float equality against a value
`sampleSheared` returns as a BILINEAR BLEND of two texels. A neighbour
therefore counted as ignited only when BOTH source texels had ignited last
generation: a lone ignition was invisible to its neighbours and percolation
could never start. `spread` 0.56 was not buying propagation, it was buying
enough density that adjacent PAIRS arose by chance. Fixed to a threshold
(`< 0.5`, one generation's age increment).

The mechanism also explains the failure's shape. The blend fraction is
constant per ring, and exactly zero only where the shear offset vanishes — at
corotation. So the automaton behaved correctly in one narrow annulus and was
crippled everywhere else, which reads as a knob that half-works rather than
as a bug.

**MEASURED, and this is what confirms the diagnosis rather than leaving it
merely plausible.** The mechanism above predicts, before the fix, structure
concentrated in a RING at `corotationRadius`. The user reports seeing exactly
that. Nothing else in the model singles out that one radius — the arm forcing
is a spiral, the gas and refractory terms are radius-blind — so a ring at
corotation has no other available cause.

**The calibration above is therefore PRE-FIX and should not be restored.**
`spread` is expected to fall back toward the classical value; `armForcing`
0.15 is independent of the bug and still stands.

## The threshold fix did not work either, and the reason subsumes both bugs

**MEASURED, 2026-08-02.** After the `< 0.5` change, `spread` STILL had to sit
at 0.56. The mechanism above was right; the fix did not follow from it.

**MEASURED, by reading the shader again.** `neighbour.y` is AGE, and age is
UNBOUNDED — step 0 seeds it at `1.0e4` and every non-igniting step increments
it. Blending a just-ignited cell (age 0) against a never-ignited one (age 1e4)
at fraction f gives `f * 1e4`, so `< 0.5` fires only for f < 0.00005. The old
test needed f exactly 0; the new one needs f < 0.00005. **Functionally the
same test**, which is why the corotation ring survived the fix.

**The general statement, worth more than either bug: you cannot threshold a
bilinear blend of an unbounded quantity — and the discrete ignition state must
not be resampled at all.** This subsumes the separately-recorded diffusion
issue (N steps = N successive blurs): both are the same mistake, resampling a
discrete field.

**DECISION: move the automaton into the MATERIAL (Lagrangian) frame.** State
stops moving — each cell keeps its own texel forever, so there is no
resampling and no diffusion. The shear goes into the two places that can
absorb it: the NEIGHBOUR lookup drifts by the accumulated differential shear
`(shearTexels(r') - shearTexels(r)) * step`, read at a ROUNDED integer texel
so the ignition test is exact; and the ARM FORCING is sampled at the material's
drifted angular position, where bilinear is correct.

**The load-bearing asymmetry, and the thing a future reader will be tempted to
"fix": interpolate the smooth field, never the discrete state.** Blurring a
smooth forcing field is harmless. Blurring discrete ignition state is what
destroyed the automaton.

Material texel azimuth then stops equalling world theta. `sfMapPack.wesl`
absorbs that with ONE final resample back to world coordinates — one blur at
the end rather than N — so `sfMapPresent.wesl`, `sampleGalaxySfMap` and
`sampleSfMapOrientation` all keep their existing contract.

This is also what Gerola & Seiden actually describe: their rings shear by
changing which cells are ADJACENT, and they never resample.

### The front runs along rings and never branches — same bug, third symptom

**MEASURED, user observation 2026-08-02.** The propagation wavefront only ever
moves azimuthally. It never moves radially and never splits.

**The mechanism, and it follows from the blend phase.** `sampleSheared` blends
in azimuth at a fractional offset, and `az` is an integer, so a read in ring r
has blend fraction `frac(-shearTexels(r))` — CONSTANT along a ring. The
azimuthal neighbours (dr=0) are read in the SAME ring at the SAME phase as the
cell's own state read; the radial neighbours (dr=+-1) are read in a different
ring at a different phase. With age unbounded, the test only fires when the
fraction is ~0 — so azimuthal propagation works in any ring that happens to
land near-integer, while radial propagation needs TWO adjacent rings to be
near-integer at once, which a continuously-varying `shearTexels` never
delivers.

Propagation is therefore trapped inside single rings. **A 1D front cannot
branch** — branching, splitting and spiral waves all require 2D connectivity,
so none of the flocculent behaviour the model exists for was reachable at any
parameter setting.

**The Lagrangian reframe fixes this for the right reason:** integer neighbour
reads make radial and azimuthal symmetric.

**Checked that the fix does not just relocate the problem.** Differential shear
between adjacent rings is `shearRate * AZ * dlnr / (2*PI*r)` ~= **0.022 texels
per ring per step** at r=8 with the calibrated settings — so adjacent rings
drift ~6.6 texels apart over 300 steps (the real shear, tearing radial links
into trailing spurs) while staying far below one texel per step, so the front
stays connected instead of fragmenting.

## The percolation threshold is 1/N, and the classical 0.18 is not our number

**INFERRED (derivation), and CORRECTED 2026-08-02 — it is a BOUND, not a
value.** `p = (baseIgnition + spread * ignitedNeighbours + armForcing * armF) *
gas` is evaluated at the RECEIVER over a Moore 8-neighbourhood, so mean
offspring per active cell is `N_eligible * spread` and criticality is
`1/N_eligible`.

The first pass took `N_eligible = 8` and reported criticality as exactly 0.125.
That is a **lower bound**, because it ignores the two terms that make most of a
neighbourhood ineligible: `ignite` requires `refractory <= 0`, and `p` is
multiplied by `gas`, which a just-ignited cell has spent. In a propagating
front the cells BEHIND it are both refractory and gas-poor, so only the leading
edge can ignite and `N_eligible` is roughly half of 8.

**MEASURED.** The user settled on `spread` **0.164** by eye. Do not "correct"
the default back down to the bound.

The bound is still the useful object: it says saturation is IMPOSSIBLE below
0.125 and possible above, which brackets the search. It does not name the edge.

**The correction that matters: Gerola & Seiden's classical ~0.18 is 1/6.** It
is the SAME branching law for THEIR 6-cell equal-area neighbourhood, not a
value to carry across to an 8-neighbourhood implementation. Quoting 0.18 as a
target here sends a tuner toward a value that mean-field theory calls 1.44x
supercritical — and the measurement below says even that is optimistic, since
the real edge sits at 0.231.

**MEASURED, and it retires "0.16 saturates" as a statement about the
DYNAMICS.** The automaton's own activity at 0.164 is 2.4e-3 of cells per step,
a twentieth of the 4.6e-2 it reaches at 0.30 — nothing is saturated. INFERRED,
from the display saturation recorded further down this section: what the tuner
saw was `oldActivity` pinning to flat white at a healthy duty cycle under the
then-current GAIN of 0.35. That is the one mechanism already on record which
produces "saturated" at a `spread` the dynamics are nowhere near.

## Where the percolation threshold really is, and what sets it

**MEASURED 2026-08-04, `npm run galaxy-renderer:percolation`.** The harness
dispatches `sfMapStep.wesl` itself — same shader, same ping-pong parity, same
`packSfMapConstants` — from a compute-only page, so there is no second
implementation of the automaton to drift. Threshold, operationally: with
`baseIgnition` and `armForcing` both zero, activity CAN reach exactly zero, so
seed ONE ignited cell and call the run surviving if any cell is still igniting
at the end. `p_c` is where survival probability over 96 independent hash seeds
crosses 0.5. It is identical at 200 and at 600 steps — above threshold a
cluster that survives its first few generations survives indefinitely — so this
is a threshold, not a finite-time artifact. Precision +-0.002 from the run
count and the local slope.

| held (everything else shipped)    | `p_c` |
| --------------------------------- | ----- |
| shipped: refractory 7, gas 0.06   | 0.231 |
| `gasRegen` 0.3                    | 0.229 |
| `gasRegen` 1.0 (no starvation)    | 0.229 |
| `refractorySteps` 15              | 0.237 |
| `refractorySteps` 3, gas 1.0      | 0.213 |
| `refractorySteps` 1 or 0, gas 1.0 | 0.185 |
| `shearRate` 0                     | 0.230 |

**REFUTED: gas starvation was never holding `spread` up.** Driving `gasRegen`
from 0.06 to 1.0 moves the threshold by 1% (0.2314 -> 0.2288) and the gain at
the shipped `spread` by 5%. The reason is structural rather than numerical: gas
binds only the cells BEHIND a front, and those are refractory anyway. The cells
that decide whether a front propagates are the virgin ones ahead of it, and
they are at full gas at every `gasRegen`. Above `1/refractorySteps` the channel
goes completely inert — 0.3 and 1.0 are bit-identical at `refractorySteps` 7,
because gas is back to full before the refractory lock clears.

**MEASURED, the real driver: `refractorySteps`.** It carries 0.185 -> 0.229,
nineteen times gas's contribution, and saturates past ~7. `shearRate` does not
enter the threshold at all. `refractorySteps` 0 and 1 are the same automaton:
a cell that just ignited has zero gas and `p` is multiplied by gas, so the gas
channel imposes a one-step lockout of its own regardless.

**The residual, and it is not a defect.** With no refractory wake and no gas
limit the threshold is still 0.185, half again the mean-field 1/8. Mean field
assumes eight INDEPENDENT offspring rolls; on a lattice a growing cluster's
frontier cells share neighbours, and that correlation costs branching ratio.
Reaching 0.125 would require a tree, not a grid. So the useful reading of the
bound is that `1/p_c` names an EFFECTIVE neighbourhood — 4.3 cells at the
shipped settings, which is what the `N_eligible ~ 4-5` guess was reaching for.

**The consequence for tuning, and it reframes the whole knob.** The shipped
0.164 is subcritical by ~30%. The disc is not lit by self-sustaining
propagation; it is lit by `baseIgnition` amplified by a gain `spread` sets
(x11.8 at 0.164, x40 at 0.20, x83 at 0.22, against the no-propagation floor).
That is a benign regime to tune in — the response is smooth and there is no
edge to fall off — but it means `baseIgnition` is a co-equal brightness
control, not a seed that only matters on a quiet disc, and that
`refractorySteps` moves `spread`'s effect as much as `spread` does. Whether the
tier WANTS to run near 0.231, where clusters are scale-free and flocculent
structure is at its most correlated, is a look call for whoever tunes it next;
nothing here argues for moving the shipped value.

**All three ignition terms are PER-STEP PROBABILITIES summed into one p**, so
each is far smaller than intuition suggests. `armForcing` 0.15 meant an arm
cell ignited with 15% probability per step from forcing ALONE — with
`refractorySteps` 7 that is about as often as it physically can, so the arms
saturated whatever `spread` did. It is a bias, not a driver; past ~0.06 it
drives.

**A display saturation hides behind the dynamical one, and it is not
cosmetic.** `oldActivity` is an EMA, `w * DECAY + GAIN` on ignition, and
`sfMapPack` clamps it to [0,1]. Steady state for a cell igniting every T steps
is `GAIN/(1 - DECAY^T)`. At DECAY 0.985 and GAIN 0.35 that pins at 1.0 for any
T below ~28, while refractory 7 plus gas recovery gives T ~ 17 — so the channel
went flat white across the whole active disc at a perfectly healthy duty cycle.
**`buildSfMapOrientation` reads exactly this channel**, and flat-white and
black are identical to a structure tensor: both have zero gradient, so
coherence goes to 0 everywhere. GAIN has to survive BOTH ends, since a cell
that ignites once a run only ever reaches GAIN itself.

`gasRegen` is the CONTRAST knob, not a rate detail: recovery takes `1/gasRegen`
steps, which is how long a burnt void stays a void rather than simmering back.

Total winding is `shearRate * steps`, so the two are not independent — cutting
`steps` for rebuild latency cuts the spur pitch by the same factor.

## The corotation ring is ALSO a residence-time artifact, independently

**INFERRED (derivation).** Even with the frame fixed, the arm forcing is a
static texture: away from corotation material shears THROUGH the ridge and
spends a few steps in it, while at corotation it sits in the ridge permanently
and takes an ignition roll every step. Total forced ignitions go as
`p * (armWidth / |shear|)`, which diverges as shear -> 0. **The model rewards
residence time; the physics rewards flux through the arm** — no relative motion
means no shock, so the real thing should show a star-formation DEFICIT at
corotation, not a ring.

That last clause is a derivation from the same density-wave premise the shear
term already encodes; it is NOT yet checked against a citation, and must not be
promoted to LITERATURE without one.

Fix: `armFactor = armF * saturate(abs(shearTexels(ring)) / armFluxRef)`, which
makes ignitions per arm passage radius-independent and sends corotation to
zero. A hard clamp at 1 texel/step puts the deficit band at r ~ 5.6-12.6 — far
too wide — so `armFluxRef` is a tunable.

**CONFIRMED 2026-08-02.** Applied, and the ring is gone. That promotes the
residence-time account from plausible to verified: it is the one cause that
survived after the material-frame rewrite removed every resampling artifact,
and removing it removed the ring.

Worth keeping for whoever tunes this next: the ring had **two independent
causes**, and each was individually sufficient to produce it. Before the
reframe it was the bilinear blend degenerating to an exact read at the one
radius where the shear offset vanishes. After the reframe it was residence
time. Fixing either alone left the symptom looking identical, which is exactly
why the first fix appeared to do nothing.

At the calibrated defaults (`corotationRadius` 7.9, `shearRate` 0.16,
`armFluxRef` 0.5, AZ 768) the weight crosses half strength at **r ~ 7.18 and
~8.79** and reaches full forcing by r ~ 5 inward and ~12 outward — a deficit
band about 1.6 units wide.

**Open, literature-backed alternative:** Dobbs & Baba 2014's transient/dynamic
spirals have a pattern speed that DECREASES with radius, so the arms roughly
corotate everywhere and there is no single corotation ring to suppress. That
would dissolve the artifact rather than damp it.

**MEASURED.** `armForcing` wants to be LOW (0.015 shipped; past ~0.06 it
drives — see §"re-seat every rate below saturation" above, which superseded
this note's original 0.15 within the hour it was written). Above that the arms
stop biasing the automaton and start driving it, which washes out the emergent
inter-arm structure and redraws the ridge as a fuzzy band — the arms are
supposed to be a thumb on the scale, not the signal.
