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
 * The star-pass block at the bottom is the app's `MilkyWayTuning` under this
 * bag's own names: the tool draws with the app's `milkyWayCloud/` shaders into
 * the app's reduced-resolution star target, so all seven of that type's knobs
 * mean the same thing here. Only two are renamed, because `RenderSettings`
 * already spells both words for something else — `starIntensity` is the app's
 * per-sprite `exposure` (this file's own `exposure` is the post chain's
 * whole-frame multiplier) and `sizeScale` is `starSizeScale`.
 */

import type { ToneMapCurve } from '../../../../src/@types/data/ToneMapCurve';

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
};
