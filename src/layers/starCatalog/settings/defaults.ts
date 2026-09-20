/**
 * starCatalog — the Layer's user-settable defaults, seeding `starCatalogsSlice`.
 * Four of them are eye-tuned against the running renderer and two are tuned as a
 * pair; each constant's comment carries its own derivation.
 */

/**
 * Default star-billboard pixel radius — the star-catalog twin of
 * `DEFAULT_POINT_SIZE_PX`. Seeds `settings.starCatalogs.sizePx` only; it is
 * NOT the shader's `sizePx` divisor (that's `STAR_SIZE_REF_PX` in
 * `data/starCullSlack.ts`, independently 2.5). 4.7 px within the shared 1–8 px
 * user range, deliberately 1.88x that divisor — the shipped, tuned look.
 */
export const DEFAULT_STAR_SIZE_PX = 4.7;

/**
 * Default star-brightness trim — the star-catalog twin of `DEFAULT_BRIGHTNESS`.
 * Seeds `settings.starCatalogs.brightness`. 1.0 = identity: the flux-glow
 * shader's calibrated `STAR_FLUX_EXPOSURE` baseline unchanged. Same 0.2–3.0
 * user range as the galaxy brightness; kept a separate constant so the two
 * layers can diverge without one silently dragging the other.
 */
export const DEFAULT_STAR_BRIGHTNESS = 1.0;

/**
 * Default star glow-overlap — seeds `settings.starCatalogs.glowOverlap`. 1.0 =
 * identity: an aggregate's flux-glow exactly fills its octree-box footprint (no
 * spread). Above it the aggregate radius is multiplied by this factor so far
 * glows overlap their neighbours and the box lattice dissolves; the vertex
 * stage divides the Gaussian peak by the square, so total luminance is
 * conserved (only the spread changes). User range 1.0–2.5. Leaves (point
 * sources) are untouched.
 *
 * 3.0 is eye-tuned, not the 1.0 physical identity: at 1.0 the far field still
 * shows the octree's box lattice as faceted seams between aggregates (see
 * `DEFAULT_STAR_REFINE_THRESHOLD` below for why a proxy threshold alone can't fully
 * hide it). Spreading each aggregate's glow to 3.0x its box radius overlaps
 * neighbours enough to dissolve the lattice into a continuous far field. Tuned
 * together with `DEFAULT_STAR_REFINE_THRESHOLD` — see that constant's comment for
 * how the two compensate.
 */
export const DEFAULT_STAR_GLOW_OVERLAP = 3.0;

/**
 * Default star-octree refine threshold — seeds `settings.starCatalogs.refineThreshold`
 * (the "Detail" slider) and `walkStarOctreeCut`'s fallback; see there for the
 * `edgePc / distancePc` proxy it compares against. Eye-tuned, not physical:
 * a coarse aggregate's photometry is right at any threshold, what a loose one
 * exposes is the octree's box lattice as faceted seams.
 *
 * LANDMINE: tuned jointly with `DEFAULT_STAR_GLOW_OVERLAP`, which hides the
 * seams a coarser cut leaves. Moving one alone gives either a visible lattice
 * (glow too narrow for the cut) or a soft, aggregate-heavy far field (cut too
 * fine for the glow) — re-check both together.
 */
export const DEFAULT_STAR_REFINE_THRESHOLD = 0.16;

/**
 * Default near-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureNearX`. The ABSOLUTE exposure multiplier the
 * scale-dependent `starExposureRamp` targets at solar-system scale (1 pc). 6 is
 * the shipped near anchor that the shader already bakes into STAR_FLUX_EXPOSURE
 * (2400 = 400 × 6), so at this default the CPU ramp returns exactly 1.0 there.
 * Live-tunable (UI range 1–60) so the near end can be re-eye-tuned against the
 * current star bins' local flux without a rebuild.
 */
export const DEFAULT_STAR_EXPOSURE_NEAR_X = 6;

/**
 * Default middle-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureMidX`. The ABSOLUTE exposure multiplier the
 * scale-dependent `starExposureRamp` targets at the intermediate few-kpc scale
 * (3 kpc), the knot that splits the ramp so the dense central clump can be
 * darkened without touching either end.
 *
 * 23 sits on the log-interpolated line between the near (6) and far (28)
 * anchors at 3 kpc: 6·(28/6)^(log₁₀(3000)/4) = 22.9 (3 kpc sits at
 * log-fraction log₁₀(3000)/4 ≈ 0.869 of the way from 1 pc to 10 kpc). A knot
 * on that line doesn't bend the three-anchor ramp at the defaults; 23 vs the
 * exact 22.9 is visually indistinguishable. Live-tunable (UI range 5–150) so
 * the middle can be pulled down against the running renderer.
 */
export const DEFAULT_STAR_EXPOSURE_MID_X = 23;

/**
 * Default far-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureFarX`. The ABSOLUTE exposure multiplier
 * `starExposureRamp` targets at whole-galaxy scale (10 kpc), where the star bin
 * reads as the Milky Way's diffuse surface brightness and the un-adapting
 * monitor needs the field lifted. 28 is the shipped far anchor; live-tunable (UI
 * range 5–300) alongside the near anchor.
 */
export const DEFAULT_STAR_EXPOSURE_FAR_X = 28;

/**
 * Default aggregate surface-brightness cap — seeds
 * `settings.starCatalogs.aggregateIntensityCap`, the "Fog cap" slider. A ceiling
 * on the per-pixel PEAK intensity of survey-star AGGREGATE records (octree
 * flux-mip glows) only; leaf (resolved-star) records stay uncapped so bright
 * stars still bloom.
 *
 * Why a cap at all: an octree aggregate deposits its whole subtree's honestly
 * summed light spread across its box footprint. A near, sub-refinement-threshold
 * aggregate at ~0.5–1.3 kpc camera distance therefore paints a large,
 * box-filling glow that reads as jarring luminous fog around the Sun. The cap
 * clips the peak so those near aggregates can't over-fill the frame.
 *
 * Deliberately NON-physical: light above the ceiling is DISCARDED, not
 * conserved (the flux-conserving alternative — spreading the excess into a wider
 * dot, the way `glowOverlap` conserves — is exactly what produces the fog, since
 * the offending glow is already box-sized). 0.06 is eye-tuned against the
 * running renderer; live-tunable (UI range 0.01–0.5) so the ceiling can be
 * re-dialled without a rebuild.
 */
export const DEFAULT_STAR_AGGREGATE_INTENSITY_CAP = 0.06;
