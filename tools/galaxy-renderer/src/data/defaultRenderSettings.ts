/**
 * DEFAULT_RENDER_SETTINGS — the tool's boot compositing knobs.
 *
 * Every knob the app also has is seeded from the app's OWN default constant
 * rather than a hand-copied number, so the tool's out-of-the-box image is the
 * app's image and a retune in `src/data/defaults.ts` follows automatically.
 * That is the point of the tool: a look tuned here has to transfer.
 *
 * The three knobs with no app counterpart — `saturation`, `vignette`,
 * `gammaEncode` — default to IDENTITY. They drive the tool-only `grade.wesl`
 * trailer, which the engine skips entirely while all three are at identity, so
 * the default pass chain is the app's pass chain exactly. They stay available
 * because matching a piece of reference astrophotography sometimes wants them;
 * moving one is then a visible, deliberate departure from app parity.
 *
 * The star-pass block is the whole of `MILKY_WAY_TUNING_DEFAULTS`
 * (`src/services/engine/galaxyGenerator/v1/milkyWayCalibration.ts`) minus two knobs that live
 * elsewhere: `lodApparent`, which lives in `DEFAULT_LOD_SETTINGS` instead, and
 * `starCount`, which feeds generation rather than compositing and so lives on
 * `DEFAULT_GALAXY_PARAMS` (the re-exported `MILKY_WAY_GALAXY_PARAMS`) instead.
 * Since the tool's boot state became the app's actual Milky Way
 * (`defaultGalaxyParams.ts`) and its star path became the app's star path
 * (the shared `milkyWay/sprites/` shaders, the reduced-resolution star target),
 * those are not merely similar knobs — they are the same knobs, so every one
 * is seeded rather than hand-copied.
 *
 * `starIntensity` is seeded from `MILKY_WAY_TUNING_DEFAULTS.exposure`, which is
 * a DIFFERENT quantity from `DEFAULT_EXPOSURE` above despite the shared word:
 * `DEFAULT_EXPOSURE` is the post-chain linear multiplier applied to the whole
 * composited frame before the tone curve (this file's `exposure` field), while
 * the tuning `exposure` is the Milky Way star sprite's own emission factor.
 * Two knobs, two stages of the pipeline, one shared English word — conflating
 * them would point `starIntensity` at the wrong constant.
 *
 * The fade block is the ONE deliberate exception to the seed-from-the-app rule
 * — see its own comment below for why parity there would mean tuning a band
 * that never closes.
 */

import type { RenderSettings } from '../../@types/engine/RenderSettings';
import {
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_TONE_MAP_CURVE,
} from '../../../../src/data/defaults';
import {
  MILKY_WAY_FADE_FULL_PX,
  MILKY_WAY_FADE_GONE_PX,
  MILKY_WAY_TUNING_DEFAULTS,
} from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  exposure: DEFAULT_EXPOSURE,
  bloom: DEFAULT_BLOOM_STRENGTH,
  bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
  saturation: 1,
  vignette: 0,
  gammaEncode: false,
  tonemap: DEFAULT_TONE_MAP_CURVE,
  sizeScale: MILKY_WAY_TUNING_DEFAULTS.starSizeScale,
  starIntensity: MILKY_WAY_TUNING_DEFAULTS.exposure,
  starPxMin: MILKY_WAY_TUNING_DEFAULTS.starPxMin,
  starPxMax: MILKY_WAY_TUNING_DEFAULTS.starPxMax,
  softness: MILKY_WAY_TUNING_DEFAULTS.softness,
  aggregateDivisor: MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor,
  // The analytic field's own target divisor, coarser than the sprites' because
  // the field is FILL-bound and a sum of wide Gaussians survives it: measured
  // 2.5-3 ms at the sprite divisor against under 1 ms at 5, with no visible
  // difference. The ceiling is not blur but bloom FIREFLIES zoomed far out —
  // the closed-form integral point-samples the ray with no pixel-footprint
  // filtering, so once the bulge core is narrower than a texel it aliases into
  // a value that trips the bloom threshold and pops as the camera moves. No
  // `MILKY_WAY_TUNING_DEFAULTS` counterpart yet — the runtime has no analytic
  // field to size a target for.
  fieldDivisor: 6,
  // The dust map's OWN divisor, finer than the field's: it carries the
  // particle-cloud tier (dustParticleCloud.ts), cloud-scale detail rather
  // than the smooth field's kpc-scale Gaussians, so it is sized against ITS
  // OWN content rather than inheriting the field's compromise — see
  // io.wesl's DUST MAP doc.
  //
  // Only ONE step finer, though, because this pass is fill-bound the way the
  // field is: thousands of cloud splats, and diving toward the galactic centre
  // puts the big ones over the whole screen at once, so cost climbs with the
  // square of the resolution exactly where the camera spends its time. 2 is
  // measurably too expensive there; the detail it buys is not worth it.
  dustDivisor: 5,
  // 1 = full canvas resolution, deliberately not coarsened like `fieldDivisor`
  // or `dustDivisor`: `hiiTex` now carries only background extras' HII
  // contribution, and an embedded shell is still small and bright by
  // construction, so ANY shared or downsampled target collapses it under a
  // texel and bloom promotes the spike into a firefly
  // (`docs/research/milky-way/hii-regions.md`).
  // The slider exists for the user to trade that away if they want to; the
  // default does not.
  extrasDivisor: 1,
  // Same firefly reasoning as `extrasDivisor` above, now the central galaxy's
  // own shells/young-stars tiers (`data/hiiTiers.ts`'s `HII_TIERS`).
  shellsDivisor: 1,
  // 2, not 1: the grain band-limit (hiiSplat/starGrain.wesl's starGrainTerm) makes the
  // half-res young target alias-free, and the tier is the HII pass's worst
  // overdraw contributor — the 4x fragment cut is the calibrated default.
  youngDivisor: 2,
  // DIG is the opposite trade from shells/young above: the biggest,
  // softest quads in the tier, and low-frequency, so a coarse target costs no
  // visible detail while cutting fragment work by roughly the square of this.
  digDivisor: 4,
  // 4.5 mirrors splatSilhouette.wesl's own SPLAT_CUT — the fade starts
  // exactly where the eye enters a component's truncation sphere, so there
  // is no dead band where the fallback quad is already live but still full
  // brightness. 1.5 is gone well before the fallback regime dominates the
  // frame — the perf/pop trade this window makes: cheaper close-in frames at
  // the cost of an unresolved wash where the component used to be.
  hiiNearFadeStart: 4.5,
  hiiNearFadeEnd: 1.5,
  // Eyeballed against the reference gallery, one static value could not
  // serve both regimes — deriveFrameView.ts blends these two by camera
  // distance (in disc radii) into the header's single scalar.
  starGrainFeatureScaleNear: 4,
  starGrainFeatureScaleFar: 15,
  // Large enough to break the grain's tile repeat, small enough to stay
  // under one tile before the warp itself starts shredding it apart
  // (starGrain.wesl's own doc) — the A/B that confirmed warp-off brings the
  // repeat back is what pins this on rather than at 0. The user's own
  // calibration under the golden-ratio warp scale: the equidistributed
  // phases need far less displacement than the old 7-tile cycle did.
  starGrainWarpAmp: 0.04,
  // 0 = off = byte-identical boot (io.wesl's perf.x, the quad-cap lever): a
  // live calibration knob, only baked to a nonzero value once the user
  // settles on one against the reference gallery.
  hiiQuadCap: 0,
  // The legacy star bag OFF at boot: it is scheduled for deletion
  // (`docs/research/milky-way/goal-and-history.md`), so the analytic field
  // alone is now the subject rather than one side of a comparison — and an
  // unattenuated sprite field sitting in front of the dust map actively
  // misreads what the dust is doing. The pill stays for the A/B. It gates the
  // STAR draws only — the legacy sprite DUST is a separate pill,
  // `legacyDustEnabled` below, and is off at boot too.
  spriteField: false,
  analyticField: true,
  // 1.0 is the calibration point itself — see `RenderSettings.analyticExposure`
  // and `deriveFrameView.ts`'s `FIELD_EXPOSURE_GAUGE`.
  analyticExposure: 1.0,
  // 0 at boot: the JWST view crossfades in a debug presentation of the dust
  // map, which is not the default look.
  dustViewIntensity: 0,
  // 0 at boot, same rationale as `dustViewIntensity`: it crossfades in a
  // debug presentation of the ISM-map generator's output.
  ismMapViewIntensity: 0,
  // 0 at boot, same rationale — and the pass-chain gate: it only
  // (re-)dispatches while this is above 0 (see createGalaxyModel.ts).
  orientationViewIntensity: 0,
  // Two sigmas, deliberately different: a small DERIVATIVE scale (noise
  // suppression before the central-difference gradient) and a larger
  // INTEGRATION scale (averaging orientations after the tensor is built,
  // conventionally 2-3x the derivative one). 1.5/4 sit mid-range on the
  // tool's sliders — enough to average out single-cell noise without
  // smearing distinct spurs together.
  orientationSigmaDerivTexels: 1.5,
  orientationSigmaIntegTexels: 4,
  // All four at 1: the composite is unchanged from before these knobs
  // existed until the user moves one — same "identity until touched"
  // discipline as saturation/vignette above.
  ismMapGasWeight: 1,
  ismMapStarsWeight: 1,
  ismMapActivityWeight: 1,
  ismMapDustWeight: 1,
  // 0, unlike the four raw-channel weights above: this is a composite
  // overlay (the exact placement density), not a raw channel, so "identity
  // until touched" here means dark rather than 1 — see `RenderSettings.
  // ismMapSeedingViewWeight`.
  ismMapSeedingViewWeight: 0,
  // 0 at boot, same rationale as the other two debug-view crossfades — and
  // the pass gate: the placement rebuild only runs while this is above 0
  // (see createGalaxyModel.ts's rebuildBubblePlacements).
  bubbleViewIntensity: 0,
  legacyDustEnabled: false,
  dustCloudEnabled: true,
  // ON at boot, which costs nothing: at the boot camera both bands read 1, so
  // the first frame is the same frame it always was. A fade that had to be
  // found and switched on would leave the tool tuning a regime the app never
  // shows, which is what this port exists to stop.
  fadeEnabled: true,
  // The one place this file DELIBERATELY breaks app parity. The app keys the
  // approach band on distance from the SUN, so flying to the galactic centre
  // still leaves the camera ~8 kpc out and the band never closes — the tool
  // would be tuning a fade that never fires. Anchored at the centre, and
  // widened to a band that spans the whole approach (full at 10 u, gone at the
  // centre itself) so the handoff is visible while it is being tuned. The
  // `sun` option stays in `FadeAnchor` to reproduce the app's behaviour.
  fadeAnchor: 'galacticCentre',
  fadeApproachFullAt: 10,
  fadeApproachGoneAt: 0,
  fadeFullPx: MILKY_WAY_FADE_FULL_PX,
  fadeGonePx: MILKY_WAY_FADE_GONE_PX,
};
