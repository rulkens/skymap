/**
 * RenderSettings — per-frame compositing and display knobs. Separated from
 * LodSettings to mirror the GPU boundary: camera UBO (view-dependent LOD)
 * vs post-chain uniforms (view-independent render quality).
 *
 * The post-chain fields are named and typed after the app's own settings so
 * the tool and the runtime can't drift: `tonemap` is the runtime
 * `ToneMapCurve` union (its numeric values ARE the shader contract), and
 * `bloom`/`bloomThreshold` are `settings.bloom.strength` /
 * `settings.bloom.threshold` under the tool's shorter names.
 *
 * `saturation` and `vignette` have NO app counterpart — they drive the
 * tool-only `grade.wesl` trailer, which is skipped entirely while they sit at
 * their identity defaults (1 and 0). Same for `gammaEncode`.
 *
 * The star-pass block at the bottom is the compositing half of the app's
 * `MilkyWayTuning` under this bag's own names: the tool draws with the app's
 * `milkyWay/sprites/` shaders into the app's reduced-resolution star target, so
 * every knob it does carry means the same thing here. Two of that type's eight
 * are absent, both because they belong to a different stage — `lodApparent` is
 * view-dependent and so rides `LodSettings`, and `starCount` feeds generation
 * rather than compositing and so rides `GalaxyParams`. Only two are renamed,
 * because `RenderSettings`
 * already spells both words for something else — `starIntensity` is the app's
 * per-sprite `exposure` (this file's own `exposure` is the post chain's
 * whole-frame multiplier) and `sizeScale` is `starSizeScale`.
 */

import type { ToneMapCurve } from '../../../../src/@types/data/ToneMapCurve';
import type { FadeAnchor } from './FadeAnchor';

export type RenderSettings = {
  /** Linear multiplier applied before the tone curve. Seeded from the app's DEFAULT_EXPOSURE. */
  readonly exposure: number;
  /** Bloom strength — the app's `settings.bloom.strength`. */
  readonly bloom: number;
  /** Bloom prefilter threshold — the app's `settings.bloom.threshold`. */
  readonly bloomThreshold: number;
  /** Tool-only grade: 1 = identity (app parity). */
  readonly saturation: number;
  /** Tool-only grade: 0 = identity (app parity). */
  readonly vignette: number;
  /** Tool-only: apply pow(c, 1/2.2) after the tone curve. false = app parity. */
  readonly gammaEncode: boolean;
  /** Tone curve, seeded from the app's DEFAULT_TONE_MAP_CURVE (Reinhard-extended). */
  readonly tonemap: ToneMapCurve;

  /** Sprite world-size multiplier — the app's `MilkyWayTuning.starSizeScale`. */
  readonly sizeScale: number;
  /** Sprite emission factor — the app's `MilkyWayTuning.exposure`, a different quantity from this file's own `exposure` field above; see `defaultRenderSettings.ts`. */
  readonly starIntensity: number;
  /** Sprite half-extent FLOOR in pixels of the star target (the anti-sparkle lever) — the app's `MilkyWayTuning.starPxMin`. */
  readonly starPxMin: number;
  /** Sprite half-extent CAP in pixels of the star target — the app's `MilkyWayTuning.starPxMax`. */
  readonly starPxMax: number;
  /** Fragment profile blend, 0 = tight core+glow, 1 = broad Gaussian at equal integral — the app's `MilkyWayTuning.softness`. */
  readonly softness: number;
  /** Downsample divisor of the star pass's offscreen — the app's `MilkyWayTuning.aggregateDivisor`. The one knob here that reaches the frame by reallocating a texture rather than by riding the uniform, and the one `starPxMin`/`starPxMax` are stated in the pixels of. */
  readonly aggregateDivisor: number;
  /** Downsample divisor of the ANALYTIC field's own offscreen. Separate from `aggregateDivisor` because the field is fill-bound and low-frequency: it takes a far coarser target than sprites do without a visible difference. Also reallocates rather than riding the uniform. */
  readonly fieldDivisor: number;
  /** Downsample divisor of the dust-column map's own offscreen. Separate from `fieldDivisor` because the dust splat is much higher-frequency than the smooth emission field it used to share a target with — see `defaultRenderSettings.ts`. Also reallocates rather than riding the uniform. */
  readonly dustDivisor: number;
  /** Downsample divisor of `hiiTex`, now home to the `hii:extras` span alone (background extras' whole HII contribution — see `HiiTierSpec`'s own doc for why it can't split further). 1 by default for the same firefly reason `shellsDivisor` is: a shell embedded in an extra is still small and bright. Also reallocates rather than riding the uniform. */
  readonly extrasDivisor: number;
  /** Downsample divisor of the shells tier's own offscreen (`data/hiiTiers.ts`'s `HII_TIERS`) — a shell sprite is small and bright by construction, so sharing a coarser target collapses it under a texel and bloom promotes the spike into a firefly. Also reallocates rather than riding the uniform. */
  readonly shellsDivisor: number;
  /** Downsample divisor of the young-stars tier's own offscreen (`data/hiiTiers.ts`'s `HII_TIERS`) — same firefly reasoning as `shellsDivisor`: a young-stars association is small and bright, not a candidate for the field's coarser compromise. Also reallocates rather than riding the uniform. */
  readonly youngDivisor: number;
  /** Downsample divisor of the DIG (diffuse ionized gas) tier's own offscreen (`data/hiiTiers.ts`'s `HII_TIERS`, the original split `shellsDivisor`/`youngDivisor` generalize) — DIG is the biggest, softest of the HII tier's quads (worst overdraw contributor at close zoom) but also its lowest-frequency content, so it tolerates a much coarser target than shells/young do. Also reallocates rather than riding the uniform. */
  readonly digDivisor: number;
  /**
   * boundRadius multiple (an HII component's own truncation-sphere sigma
   * scale, `hiiSplat`'s own `g1.w` — `vertex.wesl`'s fade gate and
   * `shadeCommon.wesl`'s `baseHiiShading`) where a component the eye is
   * approaching starts fading toward nothing instead of shading its
   * fullscreen-fallback quad at full cost — the perf lever this window
   * trades against `extrasDivisor`/
   * `digDivisor` above: those cut resolution everywhere, this instead removes
   * whole components' fragment cost near the camera at the price of an
   * unresolved wash where they used to be. Must exceed `hiiNearFadeEnd`, or
   * the fade disables (`hiiSplat/shadeCommon.wesl`'s own guard, `hiiNearFade`).
   * Defaults to `SPLAT_CUT`
   * (4.5) — see `defaultRenderSettings.ts`.
   */
  readonly hiiNearFadeStart: number;
  /**
   * boundRadius multiple where the component has fully collapsed — closer in
   * than `hiiNearFadeStart`, so it is gone before the fallback regime
   * dominates the frame. See `hiiNearFadeStart`.
   */
  readonly hiiNearFadeEnd: number;
  /**
   * Multiplier on the baked star-grain point's fixed sigma (`hiiSplat/starGrain.wesl`'s
   * `STAR_GRAIN_POINT_SIGMA_FRAC`) that sets `starGrainTerm`'s per-octave
   * band-limit feature size — the point's visible EXTENT, not its bare
   * sigma (see that function's own header for why bare sigma fades the
   * grain too early). One static value can't serve both the close-approach
   * look and the whole-galaxy framing, so this is the NEAR end of a pair —
   * `deriveFrameView.ts` blends `starGrainFeatureScaleNear`/`Far` by log
   * camera distance (in disc radii) into the single scalar the header still
   * carries. Calibrated at close approach (camera at/inside the disc);
   * defaults to 4 (`defaultRenderSettings.ts`).
   */
  readonly starGrainFeatureScaleNear: number;
  /**
   * The FAR end of the `starGrainFeatureScaleNear` pair — calibrated for
   * whole-galaxy framing, where the grain must read at a coarser scale to
   * stay visible. Defaults to 15 (`defaultRenderSettings.ts`). See
   * `starGrainFeatureScaleNear`'s own doc for the blend.
   */
  readonly starGrainFeatureScaleFar: number;
  /**
   * Domain-warp displacement amplitude (world units) `starGrain.wesl`
   * applies to the YOUNG STARS point-grain lookup before all three octave
   * taps — fixes a long chain visibly repeating the same constellation
   * every tile (`STAR_GRAIN_TILE_UNITS` = 0.64 world units there). An A/B
   * with the warp off brought the repeat straight back, so it stays on; this
   * is the amplitude's own live calibration. Too large and the warp itself
   * starts shredding the grain apart — that begins around 1x the tile
   * width. Defaults to 0.04 (`defaultRenderSettings.ts`).
   */
  readonly starGrainWarpAmp: number;
  /**
   * Ceiling on an HII component's own projected quad half-extent, in NDC
   * units (the quad-cap lever) — `splatSilhouette.wesl`'s `splatNdc` clamps to it only when
   * this header carries a nonzero value (the HII tiers alone). A close-
   * approach silhouette or fullscreen-fallback quad both truncate the
   * Gaussian's screen support at the cap; the tier's grain texture and near-
   * fade already mask the cut edge (the same argument `SPLAT_CUT` makes for
   * its own truncation). 0 = off, boot's byte-identical default — the user
   * calibrates this live, so it is not baked to a nonzero value here.
   */
  readonly hiiQuadCap: number;

  /** SPIKE, tool-only: draw the sprite star field. Off isolates the analytic field. */
  readonly spriteField: boolean;
  /** SPIKE, tool-only: draw the analytic Gaussian-mixture field into the same target. */
  readonly analyticField: boolean;
  /**
   * SPIKE, tool-only: whole-field intensity multiplier for the analytic pass.
   * 1.0 is the calibration point the field was tuned at by eye against the
   * reference gallery, NOT a parity point with the sprite field — the sprite
   * pass's own `starIntensity`/`sizeScale` no longer factor in at all (see
   * `deriveFrameView.ts`'s `FIELD_EXPOSURE_GAUGE`); absolute
   * flux is anchored on `GalaxyDescription.luminosity` instead.
   */
  readonly analyticExposure: number;
  /**
   * "JWST" view crossfade weight: 0 = pure galaxy, 1 = the primary galaxy's
   * dust-column map alone (a hot MIRI-ish palette), values between blend the
   * two additively. Requires `analyticField` — the map is presented by the
   * same pass slot the emission splat draws into, not a separate one.
   */
  readonly dustViewIntensity: number;
  /**
   * ISM-map crossfade weight: 0 = pure galaxy, 1 = the SSPSF automaton's
   * log-polar output alone, same seam as `dustViewIntensity`. The automaton
   * seeds the dust placement and the orientation field, so this is the view
   * that says whether a fault in either starts here.
   */
  readonly ismMapViewIntensity: number;
  /**
   * Orientation-overlay crossfade weight: 0 = pure galaxy, 1 = the GPU
   * structure-tensor pass chain's coherence-scaled crest orientation alone,
   * same seam as `ismMapViewIntensity`. Hue is the pitch angle (period π, so
   * it fills the full hue wheel — see `orientationPresent.wesl`), value is
   * coherence. One of the two things that keep the pass chain alive — see
   * `createGalaxyModel.ts`'s `orientationTexRebuild`; the other is
   * `GalaxyHiiTuning.ismMapSeeding`.
   */
  readonly orientationViewIntensity: number;
  /**
   * Gaussian sigma, in ismMap grid texels, for the GPU orientation pass
   * chain's field-smoothing stage (before the central-difference gradient).
   * Deliberately SMALLER than `orientationSigmaIntegTexels` — a structure
   * tensor wants a small derivative scale for noise suppression and a
   * larger integration scale for averaging orientations after the tensor is
   * built (conventionally 2-3x this one). Only reachable while
   * `orientationViewIntensity` is above 0; moving it re-dispatches the pass
   * chain the same way raising the intensity from 0 does.
   */
  readonly orientationSigmaDerivTexels: number;
  /**
   * Gaussian sigma, in ismMap grid texels, for the tensor-smoothing stage
   * (after Jxx/Jxy/Jyy are built, before the coherence readout). See
   * `orientationSigmaDerivTexels` for why the two are separate knobs: one
   * sigma for both (this pass chain's CPU predecessor) floors coherence
   * near 0.5 on pure noise instead of near 0.
   */
  readonly orientationSigmaIntegTexels: number;
  /**
   * ISM-map channel weight, isolating `gas` (io.wesl's `ismMapChannels.x`):
   * unspent ISM fuel, 1 nearly everywhere on a quiet disc, driven to 0 by an
   * ignition and refilled over `1/gasRegen` steps. The palette's dimmest
   * channel (maxes at colour 0.25 vs the stars channel's 1.0), so zeroing the
   * other three is the only way to see it against them. Only reachable while
   * `ismMapViewIntensity` is above 0.
   */
  readonly ismMapGasWeight: number;
  /**
   * ISM-map channel weight, isolating `stars` (io.wesl's
   * `ismMapChannels.y`): the young-stars tracer — fluid: an advected density
   * deposited at SF events and decaying with the run's own dissolution
   * clock; automaton: `exp(-age/12)`, that generator's own approximation of
   * it. Only reachable while `ismMapViewIntensity` is above 0.
   */
  readonly ismMapStarsWeight: number;
  /**
   * ISM-map channel weight, isolating `activity` (io.wesl's
   * `ismMapChannels.z`): the accumulated trace of every front that passed,
   * decayed per step by `activityDecay`. Only reachable while
   * `ismMapViewIntensity` is above 0.
   */
  readonly ismMapActivityWeight: number;
  /**
   * ISM-map channel weight, isolating the automaton's conserved dust channel
   * (io.wesl's `ismMapChannels.w`, sourced from the packed texel's `.w` since
   * 9aa9fe5d): swept dust, unclamped past ambient — rims legitimately
   * overshoot to the 8.0 ceiling. Scaled in linearly like the other three, so
   * lowering the weight is how the slider pulls rim overshoot back into a
   * readable range instead of it blowing out the debug view. Only reachable
   * while `ismMapViewIntensity` is above 0.
   */
  readonly ismMapDustWeight: number;
  /**
   * ISM-map SEEDING view weight — NOT a channel isolation like the four
   * above: it renders the exact composite density `dustParticleCloud.ts`'s
   * S1 CDF sampler consumes, `overshoot/meanOvershoot`, so placement can be
   * judged directly instead of inferred from raw channels — an ambient
   * pedestal glows teal in the dust channel above without contributing any
   * placement mass. A composite overlay, not a raw channel, which is why it
   * defaults to 0 (off) while the other four default to 1. The view shows
   * the density BEFORE texel-area weighting: the CDF multiplies by area, so
   * outer texels weigh more than they glow here. Only reachable while
   * `ismMapViewIntensity` is above 0.
   */
  readonly ismMapSeedingViewWeight: number;
  /**
   * Bubble-view crossfade weight: 0 = pure galaxy, 1 = the SF-event
   * catalog's own bubble/cavity placements alone (dustBubblePlacements.ts),
   * same seam as `ismMapViewIntensity`/`orientationViewIntensity`. That
   * catalog is a SECOND, independent star-formation model — resolved from
   * the same `sfEventCatalog.ts` events the SSPSF automaton never sees —
   * and this is the only way to compare the two side by side. Also this
   * layer's own gate: the placement rebuild only runs while this is above
   * 0, see `createGalaxyModel.ts`'s `rebuildBubblePlacements`.
   */
  readonly bubbleViewIntensity: number;
  /**
   * DUST (LEGACY) header pill: off forces the sprite generator's dust knobs
   * (`spriteDust`, `dustRingStrength`) to 0 in the copy handed to the engine,
   * leaving the stored `galaxy` params (and the sliders showing them)
   * untouched — see the gate in `engineBridge.ts`.
   */
  readonly legacyDustEnabled: boolean;
  /**
   * DUST CLOUD header pill: off forces `dust.cloud.count` to 0 in the copy
   * handed to the engine, same "outgoing copy only" idiom as
   * `legacyDustEnabled` — see the gate in `engineBridge.ts`.
   */
  readonly dustCloudEnabled: boolean;

  /**
   * The app's Milky-Way visibility fade, ported so the cloud can be tuned in
   * the regime the app actually shows it in. Off = the tool's historical
   * behaviour, alpha pinned at 1. The band edges are tunable here where the app
   * has them as constants; they SEED from the app's own values, so leaving them
   * alone is app parity. See `deriveMilkyWayFade`.
   */
  readonly fadeEnabled: boolean;
  /** Which point the bands measure the camera's distance from — the load-bearing knob. */
  readonly fadeAnchor: FadeAnchor;
  /** Near-side approach band's full edge, GENERATOR units (app: 0.002 Mpc). */
  readonly fadeApproachFullAt: number;
  /** Near-side approach band's gone edge, GENERATOR units (app: 0.0002 Mpc). */
  readonly fadeApproachGoneAt: number;
  /** Far-side apparent-size band's full edge, canvas px (app: MILKY_WAY_FADE_FULL_PX). */
  readonly fadeFullPx: number;
  /** Far-side apparent-size band's gone edge, canvas px (app: MILKY_WAY_FADE_GONE_PX). */
  readonly fadeGonePx: number;
};
