/**
 * `useEngineSettings` — the bulk of App.tsx's render-pass settings
 * state and the engine-callback slice that keeps it in sync.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The pattern this consolidates
 * ──────────────────────────────────────────────────────────────────────
 * Most fields here follow the same lifecycle:
 *
 *   1. React seeds an initial value from `data/defaults.ts` so the
 *      SettingsPanel renders a useful first paint before the engine's
 *      first echo lands.
 *   2. The engine fires an echo callback (e.g. `onPointSizeChange`)
 *      both at engine init AND on every `setPointSize` call, so the
 *      React copy always reflects the engine's authoritative value.
 *   3. The SettingsPanel onChange handler in App.tsx forwards user
 *      input to the engine handle (e.g. `handleRef.current?.setPointSize(v)`)
 *      and the engine echoes it right back, so no optimistic local
 *      update is needed — except for the three exceptions below.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The three App-owned exceptions
 * ──────────────────────────────────────────────────────────────────────
 *   - `filamentsEnabled` — engine has no echo callback for this; React
 *     owns it optimistically.  The hook exposes `setFilamentsEnabled`.
 *   - `filamentIntensity` — same as above.
 *   - `exposure` — engine echoes via `onExposureChange`, but the
 *     SettingsPanel's slider also nudges it locally for snappy thumb
 *     tracking (the engine's echo lands a frame later).  Exposed
 *     setter lets the App-side onChange handler do that.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why bundle into one hook?
 * ──────────────────────────────────────────────────────────────────────
 * Each individual setting is trivial; the win is collecting ~150 lines
 * of `useState` declarations + their inline rationale into one place
 * the SettingsPanel can read from.  App.tsx is freed to focus on the
 * higher-level wiring.
 */

import { useState } from 'react';
import type { EngineCallbacks } from '../@types/EngineCallbacks';
import type { LodMode } from '../@types/LodMode';
import { BiasMode } from '../data/biasMode';
import { ToneMapCurve } from '../data/toneMapCurve';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
  DEFAULT_VOLUMES_ENABLED,
} from '../data/defaults';
import type { VolumeFieldRowData } from '../components/SettingsPanel/SettingsPanel';

export type EngineSettingsState = {
  pointSize: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  filamentsEnabled: boolean;
  filamentIntensity: number;
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  visibleSourceMask: number;
  lodMode: LodMode;
  biasMode: BiasMode;
  absMagLimit: number;
  toneMapCurve: ToneMapCurve;
  exposure: number;
  /**
   * Master toggle for the scalar-volume overlay.  Mirrors
   * `EngineSettingsState.volumesEnabled` on the engine side.  No echo
   * callback — React owns it optimistically, same as `filamentsEnabled`.
   */
  volumesEnabled: boolean;
  /**
   * Snapshot of every registered field's UI state — rebuilt on each
   * `onVolumeFieldsChanged` callback via `handle.getVolumeFieldsState()`.
   * Starts empty (no cubes are registered at startup).  Each row carries
   * its own `paletteId` (per-field palette), so the dropdown lives
   * inside each field's row in the SettingsPanel.
   */
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
};

/**
 * The slice of `EngineCallbacks` this hook owns.  App.tsx spreads this
 * into its `createEngine(canvas, { ... })` options block so the engine
 * can fire echoes that drive React's settings state.
 */
export type EngineSettingsCallbacks = Pick<
  EngineCallbacks,
  | 'onPointSizeChange'
  | 'onBrightnessChange'
  | 'onAutoRotateChange'
  | 'onGalaxyTexturesEnabledChange'
  | 'onMilkyWayEnabledChange'
  | 'onHighlightFallbackChange'
  | 'onRealOnlyModeChange'
  | 'onDepthFadeEnabledChange'
  | 'onLodModeChange'
  | 'onSourceMaskChange'
  | 'onBiasModeChange'
  | 'onAbsMagLimitChange'
  | 'onToneMapCurveChange'
  | 'onExposureChange'
  | 'onFilamentsReady'
>;

export type UseEngineSettingsReturn = {
  settings: EngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
  // App-owned optimistic setters for the no-echo / partial-echo cases
  setFilamentsEnabled: (v: boolean) => void;
  setFilamentIntensity: (v: number) => void;
  setExposure: (v: number) => void;
  /**
   * Master on/off for the scalar-volume overlay.  No engine echo — React
   * owns it optimistically, same as `setFilamentsEnabled`.
   */
  setVolumesEnabled: (v: boolean) => void;
  /**
   * Rebuilds the per-field row data.  Called by App.tsx whenever the
   * engine fires `onVolumeFieldsChanged` (add/remove), reading the new
   * snapshot from `handle.getVolumeFieldsState()`.  This indirect wiring
   * avoids giving the hook itself a reference to the engine handle.
   */
  setVolumeFields: (fields: ReadonlyArray<VolumeFieldRowData>) => void;
};

export function useEngineSettings(): UseEngineSettingsReturn {
  // ── Engine-echoed values ─────────────────────────────────────────────
  // Each of these is seeded from `data/defaults.ts` so the SettingsPanel
  // renders a correct first frame before the engine's init echo arrives.
  // The engine fires each echo callback both at startup (initial seed)
  // and on every setter call, so these values always reflect engine truth.
  const [pointSize, setPointSize] = useState<number>(DEFAULT_POINT_SIZE_PX);
  const [brightness, setBrightness] = useState<number>(DEFAULT_BRIGHTNESS);
  const [autoRotate, setAutoRotate] = useState<boolean>(DEFAULT_AUTO_ROTATE);
  const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState<boolean>(
    DEFAULT_GALAXY_TEXTURES_ENABLED,
  );
  const [milkyWayEnabled, setMilkyWayEnabled] = useState<boolean>(
    DEFAULT_MILKY_WAY_ENABLED,
  );
  const [highlightFallback, setHighlightFallback] = useState<boolean>(
    DEFAULT_HIGHLIGHT_FALLBACK,
  );
  const [realOnlyMode, setRealOnlyMode] = useState<boolean>(DEFAULT_REAL_ONLY_MODE);
  const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(
    DEFAULT_DEPTH_FADE_ENABLED,
  );
  // `visibleSourceMask` is a 32-bit bitmask: bit `n` set means "draw points
  // from source n". Seeded with ALL_VISIBLE_MASK (every source on) via
  // DEFAULT_VISIBLE_SOURCE_MASK so the first paint matches the engine's
  // startup default.
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(
    DEFAULT_VISIBLE_SOURCE_MASK,
  );
  const [lodMode, setLodMode] = useState<LodMode>(DEFAULT_LOD_MODE);
  const [biasMode, setBiasMode] = useState<BiasMode>(DEFAULT_BIAS_MODE);
  const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurve>(
    DEFAULT_TONE_MAP_CURVE,
  );
  const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);

  // ── App-owned optimistic values (no engine echo) ─────────────────────
  // The engine does NOT fire echo callbacks for filaments or volumes state,
  // so React owns these optimistically. The SettingsPanel onChange handler
  // updates these directly AND forwards to the engine handle.
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(
    DEFAULT_FILAMENTS_ENABLED,
  );
  const [filamentIntensity, setFilamentIntensity] = useState<number>(
    DEFAULT_FILAMENT_INTENSITY,
  );

  // Scalar-volume master toggle — no echo, same as filamentsEnabled above.
  // No persistence: every session starts from the compile-time default.
  const [volumesEnabled, setVolumesEnabled] = useState<boolean>(DEFAULT_VOLUMES_ENABLED);

  // Per-field row data.  Starts empty (no cubes at startup).  Rebuilt by
  // App.tsx whenever the engine fires onVolumeFieldsChanged by calling
  // handle.getVolumeFieldsState() — this indirect approach keeps the hook
  // free of any reference to the engine handle.
  const [volumeFields, setVolumeFields] = useState<ReadonlyArray<VolumeFieldRowData>>([]);

  // ── One-shot from engine: filament strip + vertex counts ─────────────
  // Stays null until the engine fires `onFilamentsReady` (once, after the
  // optional `filaments.bin` lands).  The StatsPanel uses this to decide
  // whether to render the filaments row — when the file isn't on disk
  // (fresh clone before `npm run build-filaments`), this stays null and
  // the row stays hidden, which is the visually-clean default.
  const [filamentCounts, setFilamentCounts] = useState<{
    stripCount: number;
    vertexCount: number;
  } | null>(null);

  return {
    settings: {
      pointSize,
      brightness,
      autoRotate,
      galaxyTexturesEnabled,
      milkyWayEnabled,
      filamentsEnabled,
      filamentIntensity,
      filamentCounts,
      highlightFallback,
      realOnlyMode,
      depthFadeEnabled,
      visibleSourceMask,
      lodMode,
      biasMode,
      absMagLimit,
      toneMapCurve,
      exposure,
      volumesEnabled,
      volumeFields,
    },
    engineCallbacks: {
      onPointSizeChange: setPointSize,
      onBrightnessChange: setBrightness,
      onAutoRotateChange: setAutoRotate,
      onGalaxyTexturesEnabledChange: setGalaxyTexturesEnabled,
      onMilkyWayEnabledChange: setMilkyWayEnabled,
      onHighlightFallbackChange: setHighlightFallback,
      onRealOnlyModeChange: setRealOnlyMode,
      onDepthFadeEnabledChange: setDepthFadeEnabled,
      onLodModeChange: setLodMode,
      onSourceMaskChange: setVisibleSourceMask,
      onBiasModeChange: setBiasMode,
      onAbsMagLimitChange: setAbsMagLimit,
      onToneMapCurveChange: setToneMapCurve,
      onExposureChange: setExposure,
      onFilamentsReady: (stripCount, vertexCount) =>
        setFilamentCounts({ stripCount, vertexCount }),
    },
    setFilamentsEnabled,
    setFilamentIntensity,
    setExposure,
    setVolumesEnabled,
    setVolumeFields,
  };
}
