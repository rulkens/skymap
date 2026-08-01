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
 * `milkyWayCloud/` shaders into the app's reduced-resolution star target, so
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

  /** SPIKE, tool-only: draw the sprite star field. Off isolates the analytic field. */
  readonly spriteField: boolean;
  /** SPIKE, tool-only: draw the analytic Gaussian-mixture field into the same target. */
  readonly analyticField: boolean;
  /** SPIKE, tool-only: whole-field intensity multiplier for the analytic pass, where 1.0 emits the sprite field's own total flux. */
  readonly analyticExposure: number;
  /**
   * "JWST" view mode: present the primary galaxy's dust-column map directly
   * (a hot MIRI-ish palette) in place of the emission splat draw. Requires
   * `analyticField` — it replaces that pass's own draw, not a separate one.
   */
  readonly dustView: boolean;
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
