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
import { BiasMode } from '../data/biasMode';
import type { BiasMode as BiasModeT } from '../@types/data/BiasMode';
import { ToneMapCurve } from '../data/toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';
import type { PoiCategory } from '../services/engine/subsystems/poiSubsystem';
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
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
  DEFAULT_VOLUMES_ENABLED,
} from '../data/defaults';
import type { VolumeFieldRowData } from '../@types/settings/VolumeFieldRowData';
import type { UseEngineSettingsReturn } from '../@types/settings/UseEngineSettingsReturn';

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
  const [milkyWayEnabled, setMilkyWayEnabled] = useState<boolean>(DEFAULT_MILKY_WAY_ENABLED);
  const [highlightFallback, setHighlightFallback] = useState<boolean>(DEFAULT_HIGHLIGHT_FALLBACK);
  const [realOnlyMode, setRealOnlyMode] = useState<boolean>(DEFAULT_REAL_ONLY_MODE);
  const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(DEFAULT_DEPTH_FADE_ENABLED);
  // `visibleSourceMask` is a 32-bit bitmask: bit `n` set means "draw points
  // from source n". Seeded with ALL_VISIBLE_MASK (every source on) via
  // DEFAULT_VISIBLE_SOURCE_MASK so the first paint matches the engine's
  // startup default.
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(DEFAULT_VISIBLE_SOURCE_MASK);
  const [biasMode, setBiasMode] = useState<BiasModeT>(DEFAULT_BIAS_MODE);
  const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurveT>(DEFAULT_TONE_MAP_CURVE);
  const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);

  // ── App-owned optimistic values (no engine echo) ─────────────────────
  // The engine does NOT fire echo callbacks for filaments or volumes state,
  // so React owns these optimistically. The SettingsPanel onChange handler
  // updates these directly AND forwards to the engine handle.
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(DEFAULT_FILAMENTS_ENABLED);
  const [filamentIntensity, setFilamentIntensity] = useState<number>(DEFAULT_FILAMENT_INTENSITY);

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

  // ── POI label per-category visibility ────────────────────────────────
  // Engine echoes the full Record<PoiCategory, boolean> on every
  // `handle.labels.setCategoryVisible(cat, visible)` call (plus once at
  // init via seedSettingsCallbacks), so the React-side mirror is a
  // single useState slot for the whole record — toggling one category
  // re-emits all four.  Seed matches the engine default in
  // `EngineSettingsState.labelCategoryVisibility` (every category on).
  const [labelCategoryVisibility, setLabelCategoryVisibility] = useState<
    Record<PoiCategory, boolean>
  >({
    cluster: true,
    supercluster: true,
    famousGalaxy: true,
    void: true,
  });

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
      biasMode,
      absMagLimit,
      toneMapCurve,
      exposure,
      volumesEnabled,
      volumeFields,
      labelCategoryVisibility,
    },
    engineCallbacks: {
      // ── Nested sub-bag subscriptions (H5 task 11) ────────────────
      // Every echo the engine emits lands at its nested address now;
      // flat callbacks are gone.  The `partial-echo` cases (filaments
      // enabled/intensity, volumes master) remain App-owned with no
      // echo wiring, just as before.
      points: {
        onSizeChange: setPointSize,
        onBrightnessChange: setBrightness,
        onDepthFadeChange: setDepthFadeEnabled,
        onHighlightFallbackChange: setHighlightFallback,
        onRealOnlyChange: setRealOnlyMode,
      },
      tonemap: {
        onExposureChange: setExposure,
        onCurveChange: setToneMapCurve,
      },
      camera: {
        onAutoRotateChange: setAutoRotate,
      },
      sources: {
        onMaskChange: setVisibleSourceMask,
      },
      bias: {
        onModeChange: setBiasMode,
        onAbsMagLimitChange: setAbsMagLimit,
      },
      thumbnails: {
        onEnabledChange: setGalaxyTexturesEnabled,
      },
      milkyWay: {
        onEnabledChange: setMilkyWayEnabled,
      },
      filaments: {
        onReady: (stripCount, vertexCount) => setFilamentCounts({ stripCount, vertexCount }),
      },
      labels: {
        // Engine echoes the full record on every toggle; setting React
        // state to the same shape keeps the four-checkbox UI in sync
        // from a single subscription.  Spread to drop the readonly
        // wrapper for React's mutable useState slot.
        onCategoryVisibilityChange: (v) => setLabelCategoryVisibility({ ...v }),
      },
    },
    setFilamentsEnabled,
    setFilamentIntensity,
    setExposure,
    setVolumesEnabled,
    setVolumeFields,
  };
}
