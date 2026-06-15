/**
 * RenderFrameSettings — settings consumed by the HDR passes and the
 * tone-map post-process.
 *
 * Grouped into a single sub-struct rather than dumped into the top
 * level of `RenderFrameInput` so the caller can pass `{ ...settings }`
 * from a single closure-state snapshot, and so adding a new render-
 * affecting setting is a one-line addition here.
 */

import type { FocusableTarget } from '../FocusableTarget';
import type { BiasMode } from '../../data/galaxyCatalog/BiasMode';
import type { ToneMapCurve } from '../../data/ToneMapCurve';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';

export type RenderFrameSettings = {
  pointSizePx: number;
  brightness: number;
  /**
   * Selected target, or `null` when nothing is selected.  Galaxy targets
   * (`type: 'galaxyCatalog'`) are translated inside `pointSpritesPass` to
   * the packed u32 `(source << 27) | index` (or the `0xFFFFFFFF` "no
   * selection" sentinel) the shader's halo path expects.  Structure
   * targets don't drive the halo and are treated as "no galaxy selected"
   * by the pass.
   */
  selected: FocusableTarget | null;
  visibleSourceMask: number;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  biasMode: BiasMode;
  absMagLimit: number;
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
  depthFadeEnabled: boolean;
  /**
   * Procedural-disk crossfade-OUT thresholds for the points-pass
   * fragment shader.  Below `pxFadeStartPoints` points render at full
   * alpha; above `pxFadeEndPoints` at zero alpha (handing off to the
   * procedural-disk pass); inside the band a smoothstep complementary
   * to the disk pass's fade-IN does a continuous crossfade.  Both come
   * from `PROCEDURAL_DISK_FADE_START_PX` / `_END_PX` in
   * `subsystems/thumbnailSubsystem` so the two passes share one source
   * of truth.
   */
  pxFadeStartPoints: number;
  pxFadeEndPoints: number;
  /**
   * Cluster focus-mode uniform for the points pass's @group(3) binding.
   * Produced once per frame by `structureFocusSubsystem.produceFocusUniforms`
   * in `runFrame` (so it shares the frame's single `nowMs`). At rest
   * (`blend: 0`) the shader's per-vertex multiplier collapses to 1.0.
   */
  focus: FocusUniformsValue;
  exposure: number;
  toneMapCurve: ToneMapCurve;
  /**
   * Whether to invoke the thumbnail subsystem's `runFrame` this tick.
   * Lives in settings (not as a `subsystem | null` parameter) because
   * the engine surfaces it as a user-facing toggle and re-enabling
   * mid-session shouldn't tear down the subsystem.
   */
  galaxyTexturesEnabled: boolean;
  /**
   * Whether to render the procedural Milky Way impostor at the world
   * origin.  See `services/gpu/milkyWayRenderer.ts` for the rationale.
   * When false, the pass is skipped entirely (zero GPU cost beyond a
   * branch in the host CPU code).
   */
  milkyWayEnabled: boolean;
  /**
   * Whether to draw the cosmic-web filament-skeleton overlay (output of
   * the optional `npm run build-filaments` pipeline; see
   * `services/gpu/filamentRenderer.ts`).  Default OFF — opt-in feature
   * since the binary is not always present.  When true but the
   * renderer has no instance buffer (binary missing or still loading),
   * the call is a cheap no-op.
   */
  filamentsEnabled: boolean;
  /**
   * Multiplicative intensity scale for the filament overlay, in [0, 1].
   * Multiplied into the fragment-stage's final pre-multiplied alpha so
   * the user can dim the cosmic-web skeleton against the bright HDR
   * catalogue when high-σ datasets (longer, denser ridges) saturate
   * to flat white under the tone-mapped pass.  1.0 = full strength;
   * 0.0 = invisible (logically equivalent to filamentsEnabled=false).
   */
  filamentIntensity: number;
  /**
   * Master gate for the 3D scalar-field volume overlay.  When false,
   * `volumeUpsamplePass.enabled` returns false before consulting the
   * renderer, so no per-field checks or GPU work occurs — and the
   * pre-HDR `encodeVolumes` step is also a no-op (it never reaches its
   * draw because no field is active).  When true, the pass also
   * requires `volumeFieldRenderer.hasActiveFields()` to be true (at
   * least one registered field is enabled with intensity > 0).  See
   * `volumeUpsamplePass.ts` and `EngineSettingsState.volumesEnabled`
   * for the full gate rationale.
   */
  volumesEnabled: boolean;
};
