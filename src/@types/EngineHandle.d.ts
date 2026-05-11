/**
 * EngineHandle — the public API surface returned by createEngine. Lets the
 * React layer drive the engine (clear selection, destroy, set visual params)
 * without knowing its internal structure.
 */

import type { LodMode } from './LodMode';
import type { Tier } from './Tier';
import type { PointCloud } from './PointCloud';
import type { PointInfo } from './PointInfo';
import type { Source } from '../data/sources';
import type { BiasMode } from '../data/biasMode';
import type { ToneMapCurve } from '../data/toneMapCurve';
import type {
  FamousMetaEntry,
  FamousXrefMap,
} from '../services/loading/fetchers/famousMetaFetcher';
import type { PgcAliasMap } from '../services/loading/fetchers/pgcAliasFetcher';
import type { AssetSlot } from '../services/loading/types';
import type { ScalarCube, ScalarFieldPaletteId } from './ScalarCube';

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
   * Smoothly tween the camera so that the given galaxy becomes the new
   * orbit target.  The engine extracts `xyz` and `diameterKpc` from the
   * `PointInfo` for the tween, and fires `onFocusChange(info)` so the
   * URL-sync hook (and any other consumer) learns about the focus
   * commitment without each caller having to update state separately.
   *
   * The current yaw and pitch are preserved (the user keeps their
   * orientation); only `target` and `distance` change.  Calling this
   * while another tween is running cancels the previous tween and
   * starts a new one from the current camera state, so motion stays
   * continuous.  Tween duration: 600 ms.
   */
  focusOn: (info: PointInfo) => void;

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
   * Tween the camera to a viewpoint where the procedural Milky Way
   * impostor is the dominant on-screen subject (target =
   * `MILKY_WAY_CENTER_WORLD`, distance = `MILKY_WAY_VIEW_DISTANCE_MPC`,
   * preserving the user's current yaw/pitch).
   *
   * Distinct from `focusOnHome`: home is the bootstrap-derived wide
   * framing at hundreds of Mpc, well past the impostor's fade-out
   * threshold — at home the catalog wedge is the subject and the
   * impostor isn't visible at all.  This method exists so the command
   * palette's "Milky Way" pseudo-entry can route to a viewpoint that
   * actually shows the Milky Way.
   *
   * Yaw/pitch are preserved (same as `focusOn`'s galaxy tween) so a
   * user already mid-rotation keeps their orientation.  Cancels any
   * running tween.
   *
   * No-op when `state.cam` is null — same pre-bootstrap / post-destroy
   * window every camera-touching method shares.
   */
  focusOnMilkyWay: () => void;

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

  /**
   * Lazy-load the PGC → human-name alias map for the Cmd+K palette's
   * alias search.
   *
   * The underlying JSON is ~1.7 MB and most users never open the
   * palette, so the engine does NOT auto-load it at boot.  The first
   * `loadPgcAliases()` call kicks off the fetch; subsequent calls return
   * the same in-flight Promise (or the cached result), so palette code
   * can `await loadPgcAliases()` unconditionally on every open without
   * re-fetching.
   *
   * Resolves to an empty Map on fetch error (404 / parse failure) so
   * downstream code can treat "feature off" as "no aliases" without a
   * separate try/catch — exactly matching the behaviour of the previous
   * standalone `loadPgcAliases` helper that this method supersedes.
   *
   * Optional: present whenever the engine has a PGC-alias slot wired up.
   */
  loadPgcAliases?: () => Promise<PgcAliasMap>;

  /**
   * Gate the entire scalar-volume overlay on or off.
   *
   * When `false`, every registered field is skipped by `scalarVolumePass`
   * without releasing GPU resources — the same render-cost saving as
   * `setVolumeFieldEnabled(handle, false)` but applied to all fields at
   * once.  Per-field `enabled` flags and `intensity` values are preserved
   * so re-enabling the master toggle restores the previous per-field
   * configuration.
   *
   * No echo callback — the React layer owns this value optimistically via
   * the `setVolumesEnabled` setter in `useEngineSettings` (same pattern
   * as `filamentsEnabled`).
   *
   * @param enabled  True to render all fields; false to suppress the whole overlay.
   */
  setVolumesEnabled?: (enabled: boolean) => void;

  /**
   * Register a new scalar-volume field from a decoded `ScalarCube`.
   *
   * Uploads the cube's voxel data to a GPU 3D texture and adds it to the
   * renderer's active field set.  If a field with the same `handle` is
   * already registered, it is replaced (the old GPU textures are released
   * first).  Seeds `EngineSettingsState.volumeFields[handle]` with default
   * `enabled: true` and `intensity: DEFAULT_VOLUME_FIELD_INTENSITY` if not
   * already present (re-registering preserves any user-tuned values).
   *
   * Fires `onVolumeFieldsChanged` so the SettingsPanel can refresh its
   * local list of registered fields.
   *
   * @param handle  Stable string key for this field (e.g. `'cf4-dm'`).
   * @param cube    Decoded `ScalarCube` ready to upload.
   */
  addVolumeField?: (handle: string, cube: ScalarCube) => void;

  /**
   * Unregister a scalar-volume field and release its GPU resources.
   *
   * No-op if `handle` was never registered.  Removes the corresponding
   * entry from `EngineSettingsState.volumeFields` so the SettingsPanel
   * stops rendering controls for the absent field.  Fires
   * `onVolumeFieldsChanged`.
   *
   * @param handle  The handle string passed to `addVolumeField`.
   */
  removeVolumeField?: (handle: string) => void;

  /**
   * Gate a single registered field on or off without unloading its GPU
   * texture.  When `enabled` is `false`, the field is silenced for the
   * duration but its GPU resources stay allocated so re-enabling it the
   * same frame is cost-free.
   *
   * Updates `EngineSettingsState.volumeFields[handle].enabled` so the
   * SettingsPanel checkbox stays in sync.  No-op if `handle` is not
   * registered.
   *
   * @param handle   The handle string passed to `addVolumeField`.
   * @param enabled  True to render this field; false to suppress it.
   */
  setVolumeFieldEnabled?: (handle: string, enabled: boolean) => void;

  /**
   * Set the linear mix-in intensity for a single registered field.
   *
   * Clamped to [0, 1] by the renderer; values outside that range are
   * silently clamped.  At 0, the field is effectively invisible (same
   * GPU cost as `setVolumeFieldEnabled(handle, false)`).  Updates
   * `EngineSettingsState.volumeFields[handle].intensity`.  No-op if
   * `handle` is not registered.
   *
   * @param handle     The handle string passed to `addVolumeField`.
   * @param intensity  Mix-in weight in [0, 1].
   */
  setVolumeFieldIntensity?: (handle: string, intensity: number) => void;

  /**
   * Set the contrast for a single registered field.
   *
   * Contrast drives a windowing transform in the scalar-volume
   * fragment shader: > 1.0 widens a deadband around the midpoint
   * (suppressing near-mean noise) AND stretches the surviving range
   * across the full palette, so prominent structure stays visible
   * while noisy mid-range voxels fade out.  1.0 is identity (no
   * deadband, no stretching).  See `applyContrastWindow` in
   * `scalarVolume/fragment.wesl` for the math.  Orthogonal to
   * intensity: intensity controls overall opacity, contrast controls
   * which voxels participate.
   *
   * Updates `EngineSettingsState.volumeFields[handle].contrast`.  No-op
   * if `handle` is not registered.
   *
   * @param handle    The handle string passed to `addVolumeField`.
   * @param contrast  Non-negative value, conventionally in [0.25, 4.0].
   */
  setVolumeFieldContrast?: (handle: string, contrast: number) => void;

  /**
   * Set the per-cube opacity multiplier for a single registered field.
   *
   * `densityScale` enters the alpha-integral inside the scalar-volume
   * fragment shader as `1 - exp(-densityScale * sample * step)`, so it
   * controls how strongly each voxel contributes to the accumulated
   * opacity along a ray.  Independent of `intensity` (which is a final
   * linear mix-in weight) and of `contrast` (which remaps LUT
   * coordinates): density tunes optical depth, contrast tunes the
   * colour ramp's dynamic range, intensity is the global volume knob.
   *
   * Why a separate setter rather than baking it into the cube binary:
   * SCFD v2 (plan 2026-05-11) moves presentation defaults — palette
   * and densityScale — out of the binary header and into a per-handle
   * TypeScript registry.  The renderer no longer reads `densityScale`
   * from the cube; the `wireSlots` commit site sets it from
   * `VOLUME_FIELD_DEFAULTS[handle]` at registration time, and any
   * future runtime UI (a "density" slider) can feed values through
   * this method.
   *
   * Updates `EngineSettingsState.volumeFields[handle].densityScale`.
   * No-op when the handle is unknown or the renderer is not yet
   * constructed.  Negative / NaN values are clamped to 0 by the
   * renderer (a silent overlay rather than an inverted-colour bug).
   *
   * @param handle  The handle string passed to `addVolumeField`.
   * @param value   Non-negative opacity multiplier; conventionally
   *                ~1.0 for natural cubes, larger for sparse fields.
   */
  setVolumeFieldDensityScale?: (handle: string, value: number) => void;

  /**
   * Return the ordered list of currently registered field handles.
   *
   * Reflects the same set as `EngineSettingsState.volumeFields`.
   * Returns `[]` when no fields are registered or the GPU renderer is
   * not yet constructed.  The SettingsPanel uses this to render a
   * per-field slider row for each entry.
   */
  listVolumeFields?: () => string[];

  /**
   * Return a snapshot of every registered field's UI-facing state — the
   * data the SettingsPanel needs to render its per-field rows.
   *
   * Combines the ordered handle list from the renderer with the per-field
   * `enabled` and `intensity` tunables from the settings bag.  This single
   * method replaces the alternative of calling `listVolumeFields()` and
   * then reading each field's settings out of the bag separately, which
   * would require exposing internal engine state to the React layer.
   *
   * The label defaults to the handle string — callers that want
   * human-readable names should pass a label when registering the field
   * (support for a `label` option in `addVolumeField` is a future
   * extension; for now `handle` doubles as the display name).
   *
   * Returns `[]` when no fields are registered.
   */
  getVolumeFieldsState?: () => ReadonlyArray<{
    handle: string;
    label: string;
    enabled: boolean;
    intensity: number;
    contrast: number;
    /** Per-cube opacity multiplier; surfaced for the per-field Density slider. */
    densityScale: number;
    paletteId: ScalarFieldPaletteId;
  }>;

  /**
   * Set the palette LUT for a single registered scalar-volume field.
   * Updates `EngineSettingsState.volumeFields[handle].paletteId` and
   * rewrites the field's GPU LUT texture in place (no rebind).  No-op
   * if the handle is unknown or the renderer is not yet constructed.
   *
   * @param handle  The handle string passed to `addVolumeField`.
   * @param id      One of the values in `PALETTE_IDS`
   *                (`'viridis' | 'magma' | 'blue-purple' | 'yellow-green'`).
   */
  setVolumeFieldPalette?: (handle: string, id: ScalarFieldPaletteId) => void;

  /**
   * Flat read-only registry of every asset slot the engine owns, keyed by
   * the slot's `name` (e.g. `'sdss-points'`, `'2mrs-points'`,
   * `'glade-points'`, `'famous-points'`, `'filaments'`, `'famous-meta'`,
   * `'pgc-aliases'`).  Type-erased to `AssetSlot<unknown, unknown>` because
   * the four point-cloud slots, the filament slot, and the two sidecar
   * slots all carry different payload + request shapes — the dev panel
   * only needs the discriminated `state()` projection, which is uniform
   * across slot types.
   *
   * Populated lazily as the async GPU init IIFE wires each slot, so the
   * Map may be empty for the very first frames after `createEngine`
   * returns.  The dev panel handles that by simply rendering zero rows
   * until subscriptions catch up.
   *
   * Read-only contract: callers must not mutate the Map or its slots
   * directly — drive them via `slot.load()` / `slot.forceReload()` /
   * `slot.cancel()` instead.
   */
  assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};
