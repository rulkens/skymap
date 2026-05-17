/**
 * EngineCallbacks — the seam between the imperative WebGPU engine and the
 * React UI. The engine calls these functions only when values actually change,
 * so React's setState can be passed in directly without spurious re-renders.
 */

import type { EngineStatus } from './EngineStatus';
import type { GalaxyInfo } from './GalaxyInfo';
import type { LodMode } from '../data/LodMode';
import type { Tier } from '../data/Tier';
import type { ScaleInfo } from './ScaleInfo';
import type { Source } from '../../data/sources';
import type { BiasMode } from '../data/BiasMode';
import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { LoadProgressState } from '../loading/LoadProgressState';

/**
 * Callbacks the engine uses to push state changes into the UI layer.
 *
 * All callbacks are called synchronously from the engine's internal code,
 * except where noted. They are called only when the value actually changes,
 * so React's `setState` can be passed in directly.
 *
 * ### Nested-only shape (H5 task 11)
 *
 * Each sub-bag groups its callbacks by the engine sub-system they
 * concern (lifecycle / selection / camera / sources / bias / points /
 * tonemap / thumbnails / milkyWay / filaments / volumes / input).
 * Pre-task-11 the type also exposed flat siblings (`onStatusChange`,
 * `onPointSizeChange`, …); the migration is complete now and every
 * fire site lives at its nested address.
 *
 * Why namespacing at all (rather than 26 sibling lambdas)?  The
 * grouping mirrors the engine's *internal* `EngineState` sub-bags so
 * the public callback surface reads as a parallel projection of the
 * state tree.  Consumers can destructure a cluster at a time
 * (`const { points, camera } = ...`), and adding a new echo lands
 * in the cluster it belongs to instead of further bloating a flat
 * record.
 *
 * Required-ness rules: sub-bags whose members include any required
 * callback are themselves required (`lifecycle`, `selection`).
 * Bags that are entirely optional callbacks (`points`, `tonemap`, …)
 * keep their `?:` marker so subscribers can omit them without
 * needing to declare an empty object.
 */
export type EngineCallbacks = {
  /**
   * Initial data tier to load on engine startup.  Defaults to `'medium'`
   * when absent.  This is technically an option, not a callback, but the
   * `createEngine(canvas, cb)` signature already passes a single bag for
   * both — extending it here keeps the public surface compact rather than
   * introducing a separate `EngineOpts` type for one extra field.  Will
   * grow into a richer Opts split if more startup-only knobs accumulate.
   */
  initialTier?: Tier;

  /**
   * Engine lifecycle callbacks.  `onStatusChange` is required — every
   * engine consumer needs to observe the initializing → loading →
   * ready transitions (the React shell hides the loading overlay on
   * `ready`).  `onFpsChange` is optional; only the perf HUD subscribes.
   */
  lifecycle: {
    /** Fired whenever the engine status advances (initializing → loading → ready). */
    onStatusChange: (s: EngineStatus) => void;
    /**
     * Fired when the rolling-window FPS estimate changes (integer Hz).
     *
     * The engine measures inter-frame deltas inside its
     * `requestAnimationFrame` loop and averages over the last ~60
     * frames to smooth out per-frame jitter (a steady visual 60 fps
     * has individual deltas swinging between 12 and 24 ms).  This
     * callback fires only when the *integer* fps value changes
     * (e.g. 59 → 60), so React's setState is a safe direct wire-up.
     */
    onFpsChange?: (fps: number) => void;
  };

  /**
   * Selection-state callbacks.  Both required because every engine
   * consumer needs hover/select fan-out — the InfoCard text + halo
   * highlight depend on them.
   */
  selection: {
    /** Fired when the pinned/selected point changes. */
    onSelectChange: (info: GalaxyInfo | null) => void;
    /** Fired when the point under the cursor changes (null = empty sky). */
    onHoverChange: (info: GalaxyInfo | null) => void;
  };

  /**
   * Camera-state callbacks.  All entries optional — App.tsx and the
   * scale-bar subscribe, but headless / test consumers can omit.
   */
  camera?: {
    /**
     * Fired when auto-rotate is toggled (either from `setAutoRotate`
     * or at engine init so React knows the initial off state).
     */
    onAutoRotateChange?: (enabled: boolean) => void;
    /**
     * Fired when the camera-focus target changes — i.e. the engine has
     * started a tween toward (or away from) a specific galaxy.
     *
     * Selection (`onSelectChange`) and focus are separate concepts:
     *   - Selection is the pin state — InfoCard, halo highlight.  A bare
     *     canvas click fires `onSelectChange` only.
     *   - Focus is a user-deliberate camera commitment — the Focus button
     *     on the InfoCard, the `f` shortcut, a palette pick, or a deep-
     *     link resolve.  Each of those fires `onFocusChange` *in
     *     addition to* `onSelectChange`.
     *
     * The deep-link URL hook subscribes to focus, not selection, so a
     * casual click doesn't pollute browser history with `#focus=…`
     * entries — only deliberate focus actions do.
     */
    onFocusChange?: (info: GalaxyInfo | null) => void;
    /**
     * Reserved for the legacy engine-derived scale-bar emission.
     * Scale-bar derivation now happens React-side from
     * `onCameraChange` snapshots; the slot stays for future overlays
     * that want a typed `ScaleInfo` echo.
     */
    onScaleChange?: (info: ScaleInfo) => void;
    /**
     * Fired once per frame the camera state may have changed.  The
     * snapshot carries the two camera scalars React needs to derive
     * zoom-dependent values (scale bar today; potentially other
     * overlays later).  Anything more elaborate should read state
     * through its own subsystem rather than fattening this payload.
     *
     * Why a snapshot rather than the live `OrbitCamera` ref?  React
     * consumers should treat each emission as an immutable value to
     * compare against the previous one — passing the live object
     * would leak mutation semantics across the engine→React boundary
     * and defeat `setState` equality checks.
     */
    onCameraChange?: (snapshot: { distance: number; fovYRad: number }) => void;
  };

  /**
   * Point-render style echoes.  Drive the SettingsPanel controls so
   * the UI mirrors engine truth on every clamp / re-seed.
   */
  points?: {
    onSizeChange?: (sizePx: number) => void;
    onBrightnessChange?: (value: number) => void;
    onDepthFadeChange?: (enabled: boolean) => void;
    onHighlightFallbackChange?: (enabled: boolean) => void;
    onRealOnlyChange?: (enabled: boolean) => void;
  };

  /** HDR tone-mapping echoes (curve + exposure). */
  tonemap?: {
    onExposureChange?: (value: number) => void;
    onCurveChange?: (curve: ToneMapCurve) => void;
  };

  /**
   * Source-state callbacks — LOD mode, visibility mask, tier, per-
   * source readiness, and aggregated load progress.
   *
   * `onCloudReady` is granular per-source because the three .bin
   * files run as parallel fetches with very different sizes (2MRS
   * ~2 MB, SDSS ~23 MB, GLADE ~96 MB), so they land minutes apart on
   * slow connections.  Showing each as it arrives lets the user
   * explore data progressively instead of staring at a blank canvas.
   * Fires for the synthetic fallback too (with `source = Source.
   * Synthetic`) so subscribers don't need a separate code path.
   *
   * `onLoadProgress` aggregates byte counts across in-flight slots;
   * `null` means "no fetches in flight" (the UI fades the bar out).
   */
  sources?: {
    onLodModeChange?: (mode: LodMode) => void;
    onMaskChange?: (mask: number) => void;
    onTierChange?: (tier: Tier) => void;
    onCloudReady?: (source: Source, count: number) => void;
    onLoadProgress?: (progress: LoadProgressState | null) => void;
  };

  /**
   * Malmquist-bias mode + per-volume absolute-magnitude limit echoes.
   * Mirrored back so the SettingsPanel renders the right radio /
   * slider on first paint and after every clamp.
   */
  bias?: {
    onModeChange?: (mode: BiasMode) => void;
    onAbsMagLimitChange?: (absMag: number) => void;
  };

  /**
   * Galaxy-thumbnail render-pass on/off echo.  Mirrors the
   * `setGalaxyTexturesEnabled` flag (gated inside the per-frame loop,
   * so flipping it stops new fetches and quad emissions immediately).
   */
  thumbnails?: { onEnabledChange?: (enabled: boolean) => void };

  /** Milky Way impostor on/off echo. */
  milkyWay?: { onEnabledChange?: (enabled: boolean) => void };

  /**
   * Fired exactly once, after the optional cosmic-web `filaments.bin`
   * lands and is uploaded to the renderer.  Reports strip + vertex
   * counts so the UI can show e.g. "Filaments · 3,845 strips,
   * 27,410 verts".  One-shot because counts are properties of the
   * underlying file, not of the runtime visibility flag.  Silently
   * skipped on fresh clones (before `npm run build-filaments`).
   */
  filaments?: { onReady?: (stripCount: number, vertexCount: number) => void };

  /**
   * Fired when a volume field is registered or unregistered (so the
   * SettingsPanel can refresh its mirrored field list).  Does NOT
   * fire for in-place mutations (`setVolumeFieldEnabled` /
   * `setVolumeFieldIntensity`); React keeps those in optimistic
   * local state.
   */
  volumes?: { onFieldsChanged?: () => void };

  /**
   * SpaceMouse connection-state echo.  Fires for both successful
   * pair (`connect()` returned true), explicit user disconnect, and
   * unsolicited HID disconnects (USB unplugged, browser permission
   * revoked).  Without this the React "Connected" indicator can
   * persist after the puck is physically gone.
   */
  input?: {
    spaceMouse?: { onConnectedChange?: (connected: boolean) => void };
  };
};
