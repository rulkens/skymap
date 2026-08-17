# Design sketch: a conserved dust channel with a snowplough rule (2026-08-03)

Follow-up to [05-renderer-gaps.md](05-renderer-gaps.md) gaps 1/3/4/11: how the CA
implements swept rims, shared walls, reservoir/activity decorrelation and
extra-dark floors — with no new texture and one new rule. Design guidance for
the branch agent; nothing here is implemented.

## Channel budget: the state already has a free slot

CA state is rgba16float = (gas, age, refractory, activity). `refractory` is
derivable: ignition sets `age = 0, refractory = refractorySteps`; every
non-ignite step does `age+1, refractory−1` — so `refractory > 0 ⟺
age < refractorySteps`, always (the step-0 seed, age 1e4 / refractory 0, is
consistent). Fold the test into age and the z slot frees for `dust`. No
second ping-pong pair, no bandwidth change.

## Why a separate channel, not overloading `gas`

Different concerns whose calibrations must not couple: `gas` REGENERATES
(fuel; `gasRegen` is a percolation-dynamics/contrast knob), dust must be
CONSERVED and transported — regeneration is exactly what it must not do, or
voids simmer back and walls dissolve. Same discriminant, two behaviours →
two channels.

## The rule: ignition snowploughs dust outward

In the same Moore-8 loop that already fetches every neighbour for the
ignition count (zero extra reads). Conservation forces the debit ONE STEP
AFTER ignition, not at ignition: crediting neighbours off the same pre-sweep
value the debit consumes is what makes swept-away mass equal received mass —
debiting immediately (as an earlier draft of this rule did) destroys the
undonated remainder at ignition and then double-counts it a step later, since
the credit term would read the already-swept value:

```
// gather form, material frame — same drifted neighbour lookup as ignition.
// ignitedLastStep(x) reads x's age from the PREVIOUS step's state (age==0).
ownDust      = ignitedLastStep(self) ? dust * floorFraction : dust
receivedDust = Σ over neighbours n: ignitedLastStep(n) ? n.dust * (1 - floorFraction) / 8.0 : 0.0
nextDust     = ownDust + receivedDust
```

Because the front advances over multiple generations, one rule yields:

- **Snowplough**: each newly-ignited annulus pushes its load to the
  not-yet-burnt cells ahead; dust accumulates in the advancing front and
  piles up where the front stalls — the rim, holding ~swept area × ambient
  density. The 8–30× wall/floor contrast (Barnes 2023) is emergent.
- **Shared walls**: two approaching fronts pump dust into the strip between
  them — the foam's Plateau-border topology for free.
- **Decorrelation** (Chevance 2020): dust is high where ignition hasn't
  reached, consumed where it has — reservoir and activity anti-correlate by
  construction.
- **Destruction**: shares landing on already-burnt (hot) cells never arrive
  anywhere useful — dust pushed into a cavity dies. `floorFraction < 1` is
  the PAH-destruction knob and licenses extra-dark floors.
- **Knots on rims**: once the discrete event catalog samples from the map
  (staged in sf-map.md), young events land on fronts = on dust walls.

Downstream this re-keys `e2d07d54`: dust density reads the DUST channel, not
accumulated activity. Activity keeps the orientation tensor and (blurred at
pack time) a heating proxy for the MIRI-style emission view — both derivable
in `sfMapPack`, so four channels still suffice.

## Landmines

1. **The pack clamp will eat the feature.** `sfMapPack` clamps to [0,1]; wall
   dust MUST exceed ambient — the overshoot IS the rim. Log-encode or rescale
   at pack; never clamp.
2. **Conservation is approximate**: the rounded-integer neighbour relation is
   not perfectly symmetric (A may donate to a B that doesn't see A). Visually
   fine; verify no systematic azimuthal drift via a sum-over-texture readback
   in the tool's debug overlay.
3. **Never resample dust between steps** — it lives at its texel like all
   state; only the final un-shear touches it (bilinear fine there: dust is a
   smooth accumulated field — the "interpolate the smooth field, never the
   discrete state" asymmetry extends cleanly).
4. **Seeding**: step-0 dust = the radial disc profile (or the gas seed), not
   1.0 everywhere, or first-generation rims all carry identical mass.
5. **One-sided rims** (compression side bright): weight the 1/8 shares by the
   sign of `relShear` instead of splitting evenly — same loop, one weighting.

Framing for the branch: the CA owns the foam (walls, small cavities,
reservoir); discrete splats own only the marquee features.
