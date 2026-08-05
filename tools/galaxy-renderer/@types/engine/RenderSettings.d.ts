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
  /** Downsample divisor of the HII-region tier's own offscreen. Separate from `fieldDivisor` for the same reason `dustDivisor` is: a shell sprite is small and bright by construction, so sharing the smooth field's coarser target collapsed it under a texel and bloom promoted the spike into a firefly — see `defaultRenderSettings.ts`. Also reallocates rather than riding the uniform. */
  readonly hiiDivisor: number;

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
   * S4 strength for the SF-map high-pass (0 = splat column alone, 1 = full
   * detail ratio, >1 extrapolates). Applied per dust splat at accumulation
   * (dustMap.wesl), at that splat's own closest-approach point, so both the
   * JWST view's presented column and the normal view's dust attenuation
   * inherit it through the map — no per-consumer read.
   */
  readonly dustDetailStrength: number;
  /**
   * SF-map crossfade weight: 0 = pure galaxy, 1 = the SSPSF automaton's
   * log-polar output alone, same seam as `dustViewIntensity`. The automaton
   * seeds the dust placement and the orientation field, so this is the view
   * that says whether a fault in either starts here.
   */
  readonly sfMapViewIntensity: number;
  /**
   * Orientation-overlay crossfade weight: 0 = pure galaxy, 1 = the GPU
   * structure-tensor pass chain's coherence-scaled crest orientation alone,
   * same seam as `sfMapViewIntensity`. Hue is the pitch angle (period π, so
   * it fills the full hue wheel — see `orientationPresent.wesl`), value is
   * coherence. One of the two things that keep the pass chain alive — see
   * `createGalaxyModel.ts`'s `orientationTexRebuild`; the other is
   * `GalaxyDustTuning.sfMapSeeding`.
   */
  readonly orientationViewIntensity: number;
  /**
   * Gaussian sigma, in sfMap grid texels, for the GPU orientation pass
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
   * Gaussian sigma, in sfMap grid texels, for the tensor-smoothing stage
   * (after Jxx/Jxy/Jyy are built, before the coherence readout). See
   * `orientationSigmaDerivTexels` for why the two are separate knobs: one
   * sigma for both (this pass chain's CPU predecessor) floors coherence
   * near 0.5 on pure noise instead of near 0.
   */
  readonly orientationSigmaIntegTexels: number;
  /**
   * SF-map channel weight, isolating `gas` (io.wesl's `sfMapChannels.x`):
   * unspent ISM fuel, 1 nearly everywhere on a quiet disc, driven to 0 by an
   * ignition and refilled over `1/gasRegen` steps. The palette's dimmest
   * channel (maxes at colour 0.25 vs `recentSf`'s 1.0), so zeroing the other
   * two is the only way to see it against them. Only reachable while
   * `sfMapViewIntensity` is above 0.
   */
  readonly sfMapGasWeight: number;
  /**
   * SF-map channel weight, isolating `recentSf` (io.wesl's
   * `sfMapChannels.y`): `exp(-age/12)`, a cell that fired within roughly the
   * last dozen steps. Only reachable while `sfMapViewIntensity` is above 0.
   */
  readonly sfMapRecentWeight: number;
  /**
   * SF-map channel weight, isolating `oldActivity` (io.wesl's
   * `sfMapChannels.z`): the accumulated trace of every front that passed,
   * decayed per step by `activityDecay` — the channel dust placement
   * actually reads. Only reachable while `sfMapViewIntensity` is above 0.
   */
  readonly sfMapActivityWeight: number;
  /**
   * Bubble-view crossfade weight: 0 = pure galaxy, 1 = the SF-event
   * catalog's own bubble/cavity placements alone (dustBubblePlacements.ts),
   * same seam as `sfMapViewIntensity`/`orientationViewIntensity`. That
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
