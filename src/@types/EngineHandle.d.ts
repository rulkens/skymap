/**
 * EngineHandle — the public API surface returned by createEngine. Lets the
 * React layer drive the engine (clear selection, destroy, set visual params)
 * without knowing its internal structure.
 */

import type { LodMode } from './LodMode';
import type { Tier } from './Tier';
import type { PointCloud } from './PointCloud';
import type { Source } from '../data/sources';
import type { BiasMode } from '../data/biasMode';
import type { ToneMapCurve } from '../data/toneMapCurve';
import type {
  FamousMetaEntry,
  FamousXrefMap,
} from '../services/engine/famousMetaLoader';

/**
 * Handle returned by `createEngine`. Allows the React layer to drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
  /**
   * Programmatically clear the current selection.
   *
   * No-op when nothing is selected. Fires `onSelectChange(null)` if a point
   * was selected. Used by the Esc key handler in `App.tsx`.
   */
  clearSelection: () => void;

  /**
   * Stop the render loop, release GPU resources, and detach all event listeners.
   *
   * Call this from React's `useEffect` cleanup so that hot-reload and
   * StrictMode double-mounts don't leave orphaned RAF loops or GPU objects.
   */
  destroy: () => void;

  /**
   * Set the billboard pixel radius for all rendered points.
   *
   * Takes effect on the next rendered frame. Also fires `onPointSizeChange`
   * so any subscribed React state stays in sync.
   *
   * @param sizePx  Point size in pixels. Recommended range: 1.0 – 8.0.
   */
  setPointSize: (sizePx: number) => void;

  /**
   * Set the global brightness multiplier applied to every star.
   *
   * A value of 1.0 is the neutral default. Values > 1 brighten the cloud;
   * values < 1 dim it. Also fires `onBrightnessChange`.
   *
   * @param value  Brightness multiplier. Recommended range: 0.2 – 3.0.
   */
  setBrightness: (value: number) => void;

  /**
   * Enable or disable the slow automatic camera yaw.
   *
   * When enabled, the camera yaws at ~3°/second each frame, creating a
   * gentle orbit effect. The user can still drag while auto-rotate is on —
   * both yaw contributions simply add together. Also fires `onAutoRotateChange`.
   *
   * @param enabled  True to start rotating, false to stop.
   */
  setAutoRotate: (enabled: boolean) => void;

  /**
   * Toggle the galaxy-thumbnail render pass on/off.
   *
   * When disabled, the per-frame loop skips the entire selection +
   * fetch + draw block — no atlas allocations, no cutout fetches, no
   * extra draw call.  The point pass keeps running.  Also fires
   * `onGalaxyTexturesEnabledChange` so subscribed React state stays
   * in sync.
   *
   * @param enabled  True to enable thumbnails, false to disable.
   */
  setGalaxyTexturesEnabled?: (enabled: boolean) => void;

  /**
   * Toggle the procedural Milky Way impostor at world origin.  Default
   * ON (see `data/defaults.ts:DEFAULT_MILKY_WAY_ENABLED`).  Off is a
   * pure GPU-time saver and a "I want to see the cosmic web without
   * cartoon foreground" escape hatch.
   */
  setMilkyWayEnabled?: (enabled: boolean) => void;

  /**
   * Toggle the cosmic-web filament-skeleton overlay on or off.
   *
   * No-op if `filaments.bin` failed to load (the file is optional —
   * present only after `npm run build-filaments` has been run).  When
   * the overlay is enabled but the binary is missing, the call still
   * succeeds; nothing renders, no error.
   *
   * Defaults to false at engine startup so the user opts in via the
   * Settings panel.
   */
  setFilamentsEnabled?: (enabled: boolean) => void;

  /**
   * Set the filament-overlay intensity scale, in [0, 1].  Multiplied
   * into the fragment-stage's final pre-multiplied alpha by the WGSL
   * shader.  At 1.0 the overlay renders at full strength; at 0.0 it
   * is invisible (logically equivalent to disabling the overlay).
   * Useful for dimming high-σ datasets that saturate to white under
   * the tone-mapped HDR pass.
   */
  setFilamentIntensity?: (value: number) => void;

  /** Toggle the magenta tint on galaxies whose orientation is fallback. */
  setHighlightFallback?: (enabled: boolean) => void;
  /** Toggle "show only galaxies with real photometric orientation" — fallback rows are discarded. */
  setRealOnlyMode?: (enabled: boolean) => void;

  /**
   * Toggle the per-galaxy camera-distance depth fade.  When on, the
   * fragment shader multiplies alpha by `1 / (1 + (camDist / 1000Mpc)²)`
   * so galaxies far from the camera contribute less — breaks up the
   * cumulative-overlap glow at the geometric origin of the catalog where
   * additive billboards stack hundreds of galaxies into one screen pixel.
   * Default ON; toggle off to compare with the un-faded look.
   */
  setDepthFadeEnabled?: (enabled: boolean) => void;

  /**
   * Set the Malmquist-bias correction mode.  Forwarded into the per-frame
   * uniform buffer; the WGSL vertex stage branches on the integer value to
   * choose its discard / weighting strategy.  See `data/biasMode.ts` for
   * the legal values and `points.wgsl` for the per-mode behaviour.
   *
   * Fires `onBiasModeChange` so subscribed React state mirrors the engine
   * truth.  No-op for the rendered result if the mode hasn't actually
   * changed (the uniform write is still issued, but the GPU will compute
   * an identical frame).
   */
  setBiasMode?: (mode: BiasMode) => void;

  /**
   * Set the absolute-magnitude threshold used by the volume-limited mode
   * (`BiasMode.VolumeLimited`).  Galaxies whose computed absolute magnitude
   * is fainter than this value (i.e. M > absMag, since fainter = larger M)
   * are dropped in the vertex stage.
   *
   * Recommended SDSS-spectroscopic-sample value: −19.0.  Brighter limits
   * (more negative, e.g. −20.5) yield smaller, more uniform samples; fainter
   * limits (less negative, e.g. −18.0) include more dwarfs but reintroduce
   * some bias.
   */
  setAbsMagLimit?: (absMag: number) => void;

  /**
   * Set the tone-map exposure multiplier.  Higher values brighten the
   * HDR signal *before* the curve compresses it; the default of 1.0
   * preserves the existing brightness.  Useful range is roughly
   * [0.25, 4.0] — values are clamped internally to [0.05, 16] so a
   * runaway slider can't blow out the buffer.  Forwarded into the
   * tone-map pass uniform on the next rendered frame; no pipeline
   * rebuild.
   *
   * No echo callback is wired today — the SettingsPanel doesn't yet
   * surface a slider for this.  The setter ships ahead of UI so a
   * future panel addition is one prop wiring.
   */
  setExposure?: (value: number) => void;

  /**
   * Switch the HDR tone-mapping curve at runtime.  Values come from
   * `data/toneMapCurve.ts` (Linear=0, Reinhard=1, Asinh=2, Gamma2=3,
   * Aces=4).  The change takes effect on the very next frame via the
   * tone-map pass uniform — no pipeline rebuild, no shader recompile,
   * no flicker.  Fires `onToneMapCurveChange` so subscribed React
   * state mirrors engine truth.
   */
  setToneMapCurve?: (curve: ToneMapCurve) => void;

  /**
   * Snap the camera back to the initial framing computed at startup.
   *
   * Restores: target = origin, distance = bbox × 2.5, yaw = 0, pitch = 0.3.
   * The reset takes effect on the next rendered frame.
   */
  resetCamera: () => void;

  /**
   * Debug helper — log the live camera state to the console in
   * copy-paste-friendly form, so the developer can tune the initial /
   * reset framing values by interactively orbiting + zooming, hitting
   * the bound hotkey ('L' in App.tsx), and pasting the printed values
   * into `cameraFraming.ts`.
   *
   * No-op when the camera hasn't constructed yet (early call during
   * engine boot).  Not part of the user-facing UX — leave the binding
   * in dev builds; harmless in production but only useful for tuning.
   */
  logCameraState: () => void;

  /**
   * Smoothly tween the camera so that `worldXYZ` becomes the new orbit target.
   *
   * The current yaw and pitch are preserved (the user keeps their orientation);
   * only `target` and `distance` change.  Distance tweens to a sensible viewing
   * range — for now a fixed multiple of the synthetic 30 kpc galaxy diameter
   * (a future task replaces the constant with the real `galaxyDiameterKpc`).
   *
   * Calling this while another tween is running cancels the previous tween and
   * starts a new one from the current camera state, so motion stays continuous.
   * If the world position is the origin and the camera is already there, the
   * call is a no-op.  Tween duration: 600 ms.
   */
  focusOn: (worldXYZ: [number, number, number], diameterKpc?: number) => void;

  /**
   * Smoothly tween the camera back to the initial framing captured at engine
   * startup (target=origin, distance=bbox×2.5, yaw=0, pitch=0.3).
   *
   * Symmetric to `focusOn`: starts from the current state, eases over 600 ms,
   * cancels any running tween.  Always allowed — calling at home produces a
   * tiny no-op tween, never an error.
   */
  focusOnHome: () => void;

  /**
   * Select (pin) the famous-atlas galaxy with the given id, then run
   * the same focus tween `focusOn` would.  No-op if the id is not in
   * the loaded famous catalog (e.g. someone hot-reloaded the build
   * artefacts and the entry vanished).
   *
   * Used by the command palette.  Routing through the engine rather
   * than letting App.tsx call `focusOn` + `setSelected` directly keeps
   * the selection bookkeeping in one place — selection, hover, and
   * the engine's per-frame highlight uniform all stay consistent.
   */
  selectFamous: (id: string) => void;

  /**
   * Select (pin) a galaxy in any non-famous source by its (source,
   * localIdx) coordinate, then run the same focus tween `focusOn`
   * would.  Used by the command palette to land an alias hit (e.g.
   * `NGC 4565` -> the GLADE row at PGC 42038) without going through
   * the click-pick path.
   *
   * Optional because older engine builds predate the alias-search
   * feature; the palette guards on `?.` and silently falls back to
   * famous-only if absent.
   *
   * No-op if the source isn't loaded yet, or if `localIdx` is out of
   * bounds.  Same focus + selection bookkeeping as `selectFamous` so
   * the InfoCard and selection halo stay consistent.
   */
  selectByAlias?: (target: {
    source: Source;
    localIdx: number;
    /**
     * Optional famous-sidecar data the caller is responsible for.  When
     * present, takes priority over the engine's internal `state.sources.
     * famousMeta` / `famousXrefs` for `buildPointInfo`.
     *
     * Why the override exists: the engine and App both fetch the famous
     * sidecars (deliberately — see App.tsx's loader comment), and the
     * two copies can be out of sync during cold-load.  When App's drain
     * effect fires `selectByAlias` for a deep-linked `#focus=<famous-id>`,
     * App's famousMeta has already populated (its dep triggered the
     * effect) but the engine's copy may still be in-flight.  Without
     * the override, `buildPointInfo` reads the engine's empty array,
     * `info.famous` comes back undefined, and `selectionToFocusId`
     * falls through to the placeholder-PGC branch — writing a wrong
     * `pgc-<idx>` hash to the URL.  Passing App's famousMeta here
     * eliminates that race.  Other call sites (palette alias-search,
     * click handlers) leave it undefined and use the engine's copy.
     */
    famousMeta?: readonly FamousMetaEntry[];
    famousXrefs?: FamousXrefMap;
  }) => void;

  /**
   * Return the live `BigUint64Array` of object IDs for a given source,
   * or `undefined` if that source isn't loaded yet.
   *
   * Read-only contract: the caller must NOT mutate the returned array
   * (it's the same object the engine uses internally).  Used by the
   * command palette's alias-index builder, which walks objIDs once per
   * source post-load to join HyperLEDA aliases against PGC numbers.
   *
   * Optional because not every engine build needs to expose internal
   * cloud arrays — App.tsx's alias-index code guards on `?.` and falls
   * back to "no aliases" when undefined.
   */
  getCloudObjIds?: (source: Source) => BigUint64Array | undefined;

  /**
   * Return the full `PointCloud` for a given source, or `undefined` if it
   * hasn't been loaded yet.  Read-only contract — same caveat as
   * `getCloudObjIds`: don't mutate the returned object; it's the same
   * reference the engine keeps internally.
   *
   * Used by the deep-link resolver, which needs both `objIDs` (for
   * PGC/SDSS exact-match lookup) and `positions` (for the `pos@`
   * fallback nearest-neighbour search).  Distinct from `getCloudObjIds`
   * because that helper returns just the objID array — narrower
   * contract for the alias-index builder which never reads positions.
   *
   * Optional because not every engine build needs to expose internal
   * cloud data; the deep-link resolver guards on `?.` and falls back to
   * `unknown` when undefined.
   */
  getCloud?: (source: Source) => PointCloud | undefined;

  /**
   * Set the level-of-detail rendering mode.
   *
   * In `'auto'` mode the engine recomputes the visible-source mask each frame
   * from `autoLodMask(camera.distance)`, so as the user zooms the surveys
   * fade in and out by themselves.  In `'manual'` mode the engine leaves the
   * mask alone, so whatever was last set by `setSourceVisible` (or the auto
   * mask at the moment of switch) stays put — this is the mode the survey
   * toggle UI uses.
   *
   * Also fires `onLodModeChange` so subscribed React state stays in sync.
   *
   * @param mode  'auto' lets the engine choose; 'manual' gives the caller control.
   */
  setLodMode?: (mode: LodMode) => void;

  /**
   * Toggle the visibility of a single survey.
   *
   * Implicitly switches the engine into `'manual'` LOD mode — the user
   * flicking a per-survey toggle is the clearest possible signal that they
   * want explicit control, so we don't make them call `setLodMode('manual')`
   * separately.  The change takes effect on the next rendered frame; the
   * renderer's per-source draw loop simply skips buffers whose bit is clear.
   *
   * No-op if `visible` already matches the current mask state for this source.
   */
  setSourceVisible?: (source: Source, visible: boolean) => void;

  /**
   * Prompt the WebHID device picker and open a paired SpaceMouse for input.
   *
   * Must be called from a user gesture (button click) — Chromium rejects
   * `requestDevice` outside one. Returns true if a device was successfully
   * opened, false on cancel / no device / error.
   *
   * No-op when the browser has no WebHID support — feature-detection happens
   * inside the input layer, so callers can invoke this without checking.
   */
  connectSpaceMouse?: () => Promise<boolean>;

  /**
   * Close the currently-open SpaceMouse, if any. Idempotent.
   *
   * Doesn't unpair the device — the user keeps their grant and a future
   * call to `connectSpaceMouse` will silently re-acquire without prompting.
   */
  disconnectSpaceMouse?: () => void;

  /** Whether a SpaceMouse is currently open and feeding input reports. */
  isSpaceMouseConnected?: () => boolean;

  /**
   * Set the SpaceMouse global sensitivity multiplier.
   *
   * Applied AFTER the cube response curve, so the curve shape doesn't
   * change — this just scales the whole motion budget. Default 1.0;
   * recommended range 0.1 – 3.0.
   */
  setSpaceMouseSensitivity?: (value: number) => void;

  /**
   * Hot-swap the active data tier.  For each source whose tier-target
   * differs between the current and next tier, the engine cancels any
   * in-flight cloud fetch (via cloudLoader's AbortController registry)
   * and re-fetches the tier-suffixed .bin.  Sources whose target is
   * unchanged are left alone — 2MRS and Famous use one shared file
   * across all tiers, so they never re-fetch.
   *
   * Fires `onTierChange` synchronously after `state.sources.tier`
   * mutates so React state mirrors engine truth.  Re-fetches resolve
   * asynchronously and each lands via the existing `onCloudReady`
   * callback (same pipeline as the initial load).
   *
   * No-op if `tier` equals the current tier.
   */
  setTier?: (tier: Tier) => void;
};
