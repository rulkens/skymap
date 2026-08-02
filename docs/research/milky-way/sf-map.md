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

**The calibration above is therefore PRE-FIX and should not be restored.**
`spread` is expected to fall back toward the classical value; `armForcing`
0.15 is independent of the bug and still stands.

**INFERRED, still open.** The automaton re-reads its whole state through a
bilinear blend every generation, so N steps is N successive blurs and sharp
structure diffuses. Gerola & Seiden never resample: their rings shear by
changing which cells are ADJACENT. Holding state in an unsheared frame and
drifting the neighbour lookup instead would be diffusion-free and closer to
the paper. Contained to `sampleSheared` and the neighbour loop.

**MEASURED.** `armForcing` wants to be LOW (0.15, against a seeded 0.5). Above
that the arms stop biasing the automaton and start driving it, which washes out
the emergent inter-arm structure and redraws the ridge as a fuzzy band — the
arms are supposed to be a thumb on the scale, not the signal.
