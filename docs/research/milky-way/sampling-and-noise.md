# Sampling and noise

## Shot noise — the correction that matters most

**Read this before proposing any change to the LOD cull.** It is the most expensive thing in this
document to rediscover.

**MEASURED.** The generated parent is **already a Poisson point process**. `generate.wesl`'s
`buildDisk` / `buildArm` / `buildHalo` / `buildBulge` draw radius, angle, height and size from
independent per-star `genRand`/`pcg4d` hashes. Thinning a Poisson process by **any** deterministic
spatial mask yields a Poisson process again — variance equals mean for every mask geometry — so
no rearrangement of the cull threshold can reduce shot noise.

**This kills the reversed-Morton / van der Corput stratified-threshold idea**, which was designed
on the false premise of an even parent.

**MEASURED**, simulation at 200k points thinned to 10%, index of dispersion (Var/mean; 1.0 =
Poisson):

| parent                  | iid hash | stratified threshold          |
| ----------------------- | -------- | ----------------------------- |
| generated (Poisson)     | 1.000    | 0.97–1.04 at every resolution |
| jittered lattice (even) | 0.933    | **0.594**                     |

It works on an even parent. Skymap does not have one.

**MEASURED, and worse:** the failure mode is severe and the tuning gradient points straight at
it. Once a cell holds several stars they share one threshold and pop as a block — dispersion 2.2x
at occupancy 6, **45x at occupancy 49**. So "it did nothing, let me coarsen the cells" walks
directly into visible cell-sized blocks.

**MEASURED.** Three places in the generator actively maximise local variance, and fixing them
costs no fill:

1. `generate.wesl:748` — `gapSkipped` rejects arm stars on an **independent per-star coin flip**
   (`genRand(…) > 0.4 + 0.6 * clumpMod`), up to ~37% at `armClump: 0.62`. The rate is spatially
   correlated (the intended interarm gap) but each trial is its own Poisson draw, the
   maximum-variance way to hit a given mean density.
2. `randomLuminosity` (`generate.wesl:198-207`) returns `0.12 + 0.4*u³` plus a 1.2% chance of a
   `3.2 * rand` flare. Heavy tail + ~1 sprite/pixel reads exactly as clumps.
3. `fluxConservingLod` (`lib/cloudSprite.wesl`) culls per-star by hash and boosts survivors.
   Thinning to rate `p` and boosting by `1/p` holds the mean flux and multiplies the variance by
   `1/p`, so relative noise goes as `1/sqrt(pN)`.

**INFERRED.** Item 1's fix — low-discrepancy acceptance along the arm index instead of a coin
flip — would keep the same large-scale gaps with a far more even local field. Not implemented, not
simulated. Note it is the _generation_ side, so [this section's Poisson-thinning result](sampling-and-noise.md#shot-noise--the-correction-that-matters-most) does not forbid it;
stratifying the parent is exactly what does work (and is the nuance the primitives survey's
Section 6 records).

**Also see** the primitives survey's Section 3: the effective-sample-size cost of the luminosity draw is
only ~25% (`N_eff/N = 0.75` by Kish at our flare factor 3.2). Equal weights recover that for free,
but it is not an order-of-magnitude lever.

## σ²N invariance — only three things move the noise

**INFERRED (derivation shown, not measured).** Noise goes as `1/(R·sqrt(N))` and fill cost as
`N·R²`, so `noise ~ 1/sqrt(cost)` **whichever lever you pull**. Doubling the count and scaling the
radius by √2 are the same purchase at the same price. Only three things move the curve:

1. **Thin less** — costs fill, linearly.
2. **Widen the sprite** — a low-pass over noise that is white at the sprite scale; same trade.
3. **Cull by LUMINOSITY rather than at random** — the one structural escape.

**MEASURED** (arithmetic over `randomLuminosity`, `generate.wesl:198-207`, flare ignored): with
`L = 0.12 + 0.4u³`, `E[L] = 0.22`, and the top decile (`u > 0.9`) carries
`0.12·0.1 + 0.1·(1 − 0.9⁴) = 0.0464`, i.e. **21.1% of the flux**. So a brightness-ranked 90% cull
needs a **~4.7x** boost where a random one needs 10x.

**INFERRED.** That this "roughly halves noise power at the same sprite count" is the expected
consequence, not a simulated one. `inSB.y` is already at both call sites, so it is a signature
change with no new data — but the boost must be recomputed against the culled **flux** fraction,
never the culled **count** fraction. Getting that wrong changes total brightness silently.

**MEASURED, dead end:** simply enlarging sprites. Fill scales as `count × size²` and the half-res
split already bought a flat 4x.

## Immersion measure: local mean sprite separation

**INFERRED, supported by one numerical coincidence.** The right measure of "am I inside the
sprites" is the local mean sprite separation

```
s = (N · ν̂)^(−1/3)
```

**MEASURED** (arithmetic over cited constants): for N = 150,000 over a disc of R = 17.5 kpc and
full thickness 0.6 kpc, the volume is `π·17.5²·0.6` = 577.3 kpc³, giving 259.8 sprites/kpc³ and
**s = 157 pc**.

The hand-tuned `goneAt` is **200 pc** (`scaleFadeBands.ts:77`), arrived at independently by eye.

**Record the convergence — it is evidence the measure is the right one. It is not a proof.** One
coincidence within 30% is what we have.

**Consequence to carry.** The encoding survives the star bag's deletion (see [the goal, stated by the user](goal-and-history.md#the-goal-stated-by-the-user)) but `N` changes
meaning: globulars and HII regions become individually resolvable too, so the question persists
while the thing being counted does not.

## Sampling lessons — blob counts and the ring seam (2026-08-01)

**Blob count is a sag bound, not a knob.** Between ridge blobs the linearised chain sags below
the true curve by chord²·κ/8. Bounding that against the local σ_across (tolerance 0.3) derives
the per-arm count: ~19–22 at the MW preset (vs the previously eyeballed 28), growing automatically
with tighter pitch, narrower width, or stronger meander. Budgeting the count against the component
cap makes overflow impossible by construction — the readout's warning became dead code.

**More rings is NOT a free smoothness upgrade.** The derived ring sigma is proportional to ring
_spacing_, so raising ring count narrows every ring — which keeps the band gapless internally but
**sharpens the band's edges**. Freezing the count at 8 (on a "warp fidelity is nearly free"
argument) produced a single faint visible ring at the band's inner edge against the origin discs;
the visually settled value was 2, where the derivation reproduces the approved σ = 0.13 exactly.
The derivation guarantees gaplessness _inside_ the band and says nothing about blending at its
boundaries. Warp fidelity inside the band is bounded by ring count; at 2 the settled look accepts
that trade knowingly.
