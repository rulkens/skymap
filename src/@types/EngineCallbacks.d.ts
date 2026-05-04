/**
 * EngineCallbacks — the seam between the imperative WebGPU engine and the
 * React UI. The engine calls these functions only when values actually change,
 * so React's setState can be passed in directly without spurious re-renders.
 */

import type { EngineStatus } from './EngineStatus';
import type { PointInfo } from './PointInfo';
import type { ScaleInfo } from './ScaleInfo';
import type { LodMode } from './LodMode';
import type { Source } from '../data/sources';
import type { BiasMode } from '../data/biasMode';
import type { ToneMapCurve } from '../data/toneMapCurve';

/**
 * Callbacks the engine uses to push state changes into the UI layer.
 *
 * All callbacks are called synchronously from the engine's internal code,
 * except where noted. They are called only when the value actually changes,
 * so React's `setState` can be passed in directly.
 *
 * The three optional settings callbacks (`onPointSizeChange`, `onBrightnessChange`,
 * `onAutoRotateChange`) are optional so existing call-sites that don't need
 * settings panel integration continue to typecheck without changes.
 */
export type EngineCallbacks = {
  /** Fired whenever the engine status advances (initializing → loading → ready). */
  onStatusChange: (s: EngineStatus) => void;
  /** Fired when the point under the cursor changes (null = empty sky). */
  onHoverChange: (info: PointInfo | null) => void;
  /** Fired when the pinned/selected point changes. */
  onSelectChange: (info: PointInfo | null) => void;
  /** Fired when the scale bar label or width changes (zoom or resize). */
  onScaleChange: (info: ScaleInfo) => void;

  /**
   * Fired when the point size changes (either from a `setPointSize` call or at
   * engine init so React's initial state matches the engine's default).
   */
  onPointSizeChange?: (sizePx: number) => void;
  /**
   * Fired when the global brightness multiplier changes (either from a
   * `setBrightness` call or at engine init to seed React's initial state).
   */
  onBrightnessChange?: (value: number) => void;
  /**
   * Fired when auto-rotate is toggled (either from `setAutoRotate` or at
   * engine init so React knows the initial off state).
   */
  onAutoRotateChange?: (enabled: boolean) => void;
  /**
   * Fired when the galaxy-thumbnail render pass is toggled on/off (either
   * from `setGalaxyTexturesEnabled` or at engine init to seed React's
   * initial state).  The pass itself is gated by this flag inside the
   * per-frame loop, so flipping it stops new fetches and quad emissions
   * immediately on the next frame.
   */
  onGalaxyTexturesEnabledChange?: (enabled: boolean) => void;
  /**
   * Fired when the engine's `setMilkyWayEnabled` updates the flag.
   * The React shell uses this to drive the SettingsPanel checkbox so
   * the UI reflects the engine's authoritative state.
   */
  onMilkyWayEnabledChange?: (enabled: boolean) => void;
  /**
   * Optional echo of the highlight-fallback toggle state so the
   * SettingsPanel can stay in sync if the engine ever flips it
   * programmatically (e.g. via a future keyboard shortcut).
   */
  onHighlightFallbackChange?: (enabled: boolean) => void;
  /**
   * Optional echo of the show-only-real-orientations toggle state.
   */
  onRealOnlyModeChange?: (enabled: boolean) => void;
  /**
   * Optional echo of the depth-fade toggle state.  Mirrors the per-galaxy
   * camera-distance alpha attenuation that fights the centre-of-volume
   * over-saturation; the engine seeds it at init and fires this whenever
   * `setDepthFadeEnabled` is called.
   */
  onDepthFadeEnabledChange?: (enabled: boolean) => void;
  /**
   * Optional echo of the Malmquist-bias mode selector — fired both when
   * the engine seeds its initial value at startup and when a future
   * `setBiasMode` call mutates it.  Subscribed React state should mirror
   * the engine truth so the SettingsPanel renders the right radio button
   * (Task 5 of the malmquist-bias plan adds the UI).
   */
  onBiasModeChange?: (mode: BiasMode) => void;
  /**
   * Optional echo of the volume-limited absolute-magnitude threshold.
   * Same lifecycle as `onBiasModeChange` — seeded at startup, fired by
   * `setAbsMagLimit`.
   */
  onAbsMagLimitChange?: (absMag: number) => void;
  /**
   * Echoed by the engine on init *and* after every `setToneMapCurve`
   * call so React's SettingsPanel state stays in sync with engine
   * truth.  Same pattern as `onBiasModeChange`.
   */
  onToneMapCurveChange?: (curve: ToneMapCurve) => void;
  /**
   * Echoed by the engine on init *and* after every `setExposure` call
   * so React's SettingsPanel exposure slider stays in sync with engine
   * truth.  Same lifecycle as `onToneMapCurveChange` — seed at startup
   * (so the slider shows the engine default — currently 1.0 — on first
   * paint without React having to duplicate that default), then fire on
   * every clamped mutation so a runaway value (e.g. devtools setting
   * 1e9) is reflected back as the actual clamped result rather than the
   * caller's input.
   *
   * Why echo at all (rather than letting React own the value
   * optimistically)?  Same reason as the rest of the settings echoes —
   * the engine clamps and is the single source of truth.  If the slider
   * pushes 100 but the engine clamps to 16, React must reflect the
   * clamped value or the displayed number drifts away from what the
   * shader is using.
   */
  onExposureChange?: (value: number) => void;
  /**
   * Fired when the level-of-detail mode changes (either from a `setLodMode`
   * call or at engine init to seed React's initial state).
   */
  onLodModeChange?: (mode: LodMode) => void;
  /**
   * Fired when the SpaceMouse connection state changes — either because the
   * user successfully paired (`connect()` returned true), explicitly clicked
   * disconnect, or because the underlying HID device emitted its own
   * `disconnect` event (USB unplugged, browser permission revoked).
   *
   * Without this callback the React-side "Connected" indicator can persist
   * after the puck is physically gone — confusing because the slider stays
   * visible but no axes ever move the camera.
   */
  onSpaceMouseConnectedChange?: (connected: boolean) => void;
  /**
   * Fired when the visible-source bitmask changes — either because auto-LOD
   * recomputed it after the camera distance crossed a band threshold, or
   * because `setSourceVisible` flipped a bit.
   *
   * Without this callback the React-side checkboxes can drift out of sync with
   * the engine's actual mask: at startup React initialises to `ALL_VISIBLE_MASK`,
   * but auto-LOD almost immediately reduces the engine mask based on the
   * initial camera distance.  The first user toggle then operates on a stale
   * React state and produces a visible no-op (the toggled bit was already in
   * the requested state on the engine side), forcing a second click.
   */
  onSourceMaskChange?: (mask: number) => void;
  /**
   * Fired when the rolling-window FPS estimate changes (integer Hz).
   *
   * The engine measures inter-frame deltas inside its `requestAnimationFrame`
   * loop and averages over the last ~60 frames to smooth out the per-frame
   * jitter that an instantaneous `1/dt` would produce (a steady visual 60 fps
   * has individual deltas swinging between 12 and 24 ms — a status-bar number
   * driven by raw deltas would be unreadable).  This callback fires only when
   * the *integer* fps value changes (e.g. 59 → 60), so React's setState is a
   * safe direct wire-up — no spurious renders on noise.
   *
   * Optional because most engine consumers (tests, headless renders) don't
   * care; the perf-investigation HUD in the status bar is the only subscriber
   * today.
   */
  onFpsChange?: (fps: number) => void;
  /**
   * Fired each time a per-survey `.bin` file finishes loading and the cloud
   * has been uploaded to the renderer.  Surfaces progressive load state to
   * the React layer so the status bar can show e.g. "loaded 2/3 surveys".
   *
   * Why a granular per-source callback (rather than one final "all done"
   * event)?  The three .bin files run as parallel `fetch`es with very
   * different sizes (2MRS ~2 MB, SDSS ~23 MB, GLADE ~96 MB), so they land
   * minutes apart on slow connections.  Showing each one as it arrives lets
   * the user see and explore data progressively instead of staring at a
   * blank canvas until the largest survey finishes.
   *
   * Fires for the synthetic fallback too (when all three real fetches fail),
   * with `source = Source.Synthetic`, so subscribers don't need a separate
   * code path for the no-data case.
   */
  onCloudReady?: (source: Source, count: number) => void;
};
