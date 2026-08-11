# Analytic field

## There is no MGE of the Milky Way, and there cannot be

**LITERATURE, verified by search.** No published Multi-Gaussian Expansion of the Milky Way
exists. MGE deprojects an **observed surface-brightness image**; we are inside the object.
Every Milky Way MGE hit is a system _within_ the Galaxy (M54's nuclear cluster, and similar),
never the Galaxy itself.

**This is the single most likely thing for a future reader to try to "fix".** It cannot be
fixed by searching harder. It corrects the primitives survey's Section 8, which presents MGE as the
leading candidate for the analytic base without noting that the Milky Way's expansion would have
to be **fitted by us, offline, to a published emissivity model** rather than looked up.

**LITERATURE.** The substitute is a fitted near-IR emissivity model — COBE/DIRBE traces red
giants, i.e. the bulk NIR luminosity, so those fits _are_ flux fields. See [the citation table](literature.md#literature--verified-citations).

**LITERATURE.** F98's own laws (`sech²`, generalised ellipsoids) have no closed-form line integral
either, so "just use the published model" means marching. Closed form requires fitting our own
Gaussian mixture to F98's field.

## Closed form, and its limit

**MEASURED** (implemented and in the tree at `src/services/gpu/shaders/lib/gaussianIntegral.wesl`).
A ray through an anisotropic Gaussian with **finite or semi-infinite bounds** integrates to
`erf`/`erfc`, **not** a bare `exp`. For `ν(p) = A·exp(−½ pᵀMp)` and `p(t) = o + t·d` with `d`
normalised, `a = d·M·d`, `b = o·M·d`, `c = o·M·o`, the emission from the eye to infinity is

```
A · sqrt(π / 2a) · exp(−½(c − b²/a)) · erfc(b / sqrt(2a))
```

This **corrects** the earlier "~20 `exp()`, no marching" claim, which was optimistic twice. The
`erfc` is cheap (Abramowitz & Stegun 7.1.26 rational approximation), so the first correction is
minor.

**The second correction is not minor. INFERRED (analysis, not a proof we wrote down):**
emission-**only** is closed form; emission **with self-absorption** is not. The outer integral
`∫T(t)σ(t)c(t)dt` contains `e^{−erf(t)}`. **This bites for a SINGLE Gaussian, not merely across
layers** — so it is not a layering problem that better ordering fixes.

Consequences:

- **Dust stays a separate multiplicative screen.** That is now a founded decision, not a
  convenience.
- **Mixed dust later is genuinely hard.** LITERATURE: the splatting field's workarounds are
  sorted alpha blending, constant-density ellipsoids, and moment-based transmittance — see the
  primitives survey's Section 10, which also quantifies how wrong a screen composite is (×3.2 flux error
  at τ = 2, ×30 at τ = 5, and a deleted near/far asymmetry that reads as fake).
- **The seam cannot be additive.** `base + detail` is valid only where dust is a screen in front
  of the emission, not mixed through it.

Sketch under discussion, **not implemented**, INFERRED:

```ts
type RaySegment = { readonly emission: Vec3; readonly transmittance: Vec3 };
type FluxField = { readonly integrate: (o: Vec3, d: Vec3) => RaySegment };
// composite(base, detail) = base.emission * detail.transmittance + detail.emission
```

**MEASURED, current limitation.** The analytic field pass does not model the warp:
`milkyWay/field/field.wesl:10-13` states it, and the reason is that the generator applies the warp
as a per-star `y` offset **after** placement, which a closed-form integral of an unwarped mixture
cannot carry. Edge-on views show the analytic field straight where the sprites bend. [The shear analysis below](analytic-field.md#a-shear-preserves-the-closed-form--but-not-on-an-origin-centred-gaussian) was
written expecting a per-component shear to close this; it has since been implemented and
**measured wrong**. Read [that analysis](analytic-field.md#a-shear-preserves-the-closed-form--but-not-on-an-origin-centred-gaussian) before attempting it again.

## A shear preserves the closed form — but not on an origin-centred Gaussian

**MEASURED. The per-component shear was implemented and is WRONG. Do not re-propose it.**

The algebra that motivated it is sound and still holds: under `p → S·p` a Gaussian's quadratic
form transforms as `M → SᵀMS`, so [closed form, and its limit](analytic-field.md#closed-form-and-its-limit)'s `erfc` integral survives exactly at zero per-ray cost, and
`det(S) = 1` leaves the flux normalisation untouched.

What does not hold is the step from there to "each Gaussian gets its own `S`, and the mixture
approximates the curve". **Every component in the mixture was centred at the ORIGIN** — the shader
evaluates `exp(−½ pᵀMp)` about `p = 0`. A shear applied there traces a **straight line through the
origin**. The generator's warp (`generate.wesl:330-341`) is identically **zero** inside
`warpStartRadius` and only then bends as `rel²`. No linear function is both.

**MEASURED**, ridge height along a radial line, in units of disc thickness, for the Milky Way
preset with the six-Gaussian disc:

| R/R_out | true warp | σ=3.4h component | σ=5.0h component |
| ------- | --------- | ---------------- | ---------------- |
| 0.20    | 0.00      | −0.00            | **−0.15**        |
| 0.57    | 0.00      | −0.00            | **−0.42**        |
| 1.00    | **−1.13** | −0.01            | −0.73            |
| 1.15    | **−2.74** | −0.01            | −0.84            |

Each component tilts by a different amount, so instead of one warped surface they **fan apart**.
Rendered edge-on this reads as two faint flat sheets, which is how the user found it.

**The diagnostic trap, recorded because it is what let this ship.** Verifying that the shear
matches the true warp **at each component's linearisation radius** always passes — that is the one
point where a tangent is exact by construction. A per-component table of shear magnitudes looked
healthy for exactly that reason. **The honest check is the ridge across the whole disc**, which is
the table above; a single-radius check cannot fail.

**The fix requires components to carry a CENTRE**, so that a blob can be localised in radius and a
shear becomes a linearisation about the blob's own centre rather than about the galaxy's. The warp
then comes from **where the blobs are placed** — on the warped surface — rather than from bending
a blob that spans the whole galaxy. In flight, unproven at time of writing; the acceptance test is
the ridge table above, not a per-component one.

**Consequence beyond the warp.** Centres are a prerequisite for [the goal, stated by the user](goal-and-history.md#the-goal-stated-by-the-user)'s named features in general:
dust lanes, star-forming regions and globular clusters are all localised objects and none can be
an origin-centred Gaussian.
