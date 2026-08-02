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

**Open, literature-backed alternative:** Dobbs & Baba 2014's transient/dynamic
spirals have a pattern speed that DECREASES with radius, so the arms roughly
corotate everywhere and there is no single corotation ring to suppress. That
would dissolve the artifact rather than damp it.

**MEASURED.** `armForcing` wants to be LOW (0.15, against a seeded 0.5). Above
that the arms stop biasing the automaton and start driving it, which washes out
the emergent inter-arm structure and redraws the ridge as a fuzzy band — the
arms are supposed to be a thumb on the scale, not the signal.
