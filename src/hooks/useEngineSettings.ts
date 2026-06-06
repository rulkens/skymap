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

import { useCallback, useState } from 'react';
import type { BiasMode as BiasModeT } from '../@types/data/BiasMode';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';
import type { FlowSettings } from '../@types/settings/FlowSettings';
import type { PoiCategory } from '../@types/engine/data/PoiCategory';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FLOW,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_SPACE_MOUSE_SENSITIVITY,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
} from '../data/defaults';
import { Source, SOURCE_REGISTRY } from '../data/sources';
import { ALL_VISIBLE_MASK } from '../utils/sourceMask';
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
  const [showPickBuffer, setShowPickBuffer] = useState<boolean>(DEFAULT_SHOW_PICK_BUFFER);
  const [showDiskRadiusRing, setShowDiskRadiusRing] = useState<boolean>(
    DEFAULT_SHOW_DISK_RADIUS_RING,
  );
  // `visibleSourceMask` is a 32-bit bitmask: bit `n` set means "draw points
  // from source n". Seeded with ALL_VISIBLE_MASK so the first paint matches
  // the engine's startup default.
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(ALL_VISIBLE_MASK);
  const [biasMode, setBiasMode] = useState<BiasModeT>(DEFAULT_BIAS_MODE);
  const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurveT>(DEFAULT_TONE_MAP_CURVE);
  const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);

  // ── App-owned optimistic values (no engine echo) ─────────────────────
  // The engine does NOT fire echo callbacks for filaments or volumes state,
  // so React owns these optimistically. The SettingsPanel onChange handler
  // updates these directly AND forwards to the engine handle.
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(
    SOURCE_REGISTRY[Source.Filaments].visible,
  );
  const [filamentIntensity, setFilamentIntensity] = useState<number>(
    SOURCE_REGISTRY[Source.Filaments].intensity,
  );

  // Scalar-volume master toggle — no echo, same as filamentsEnabled above.
  // No persistence: every session starts from the compile-time default.
  const [volumesEnabled, setVolumesEnabled] = useState<boolean>(DEFAULT_VOLUMES_ENABLED);

  // ── CF4++ flow-field overlay (App-owned optimistic, no echo) ──────────
  // The engine fires NO echo callback for flow — same as filamentsEnabled —
  // so React owns the whole `settings.flow` slice directly, seeded from
  // DEFAULT_FLOW. It's one `FlowSettings` object rather than nine scalar cells:
  // the panels and the engine handle are both driven by a `Partial<FlowSettings>`
  // patch (see `updateFlow` and `handle.flow.set`), so a knob change is one
  // patch on each side and adding a knob doesn't grow this hook.
  const [flow, setFlow] = useState<FlowSettings>(DEFAULT_FLOW);

  /** Merge an optimistic patch into the React mirror; App pairs it with `handle.flow.set`. */
  const updateFlow = useCallback((patch: Partial<FlowSettings>) => {
    setFlow((prev) => ({ ...prev, ...patch }));
  }, []);

  // Per-field row data.  Starts empty (no cubes at startup).  The engine
  // pushes a fresh snapshot through `volumes.onFieldsChanged(fields)`
  // after every add / remove / tunable mutation; the callback is wired
  // a few lines down and drops `debug-*` fixture handles on the way in
  // so the panel only sees real science volumes.
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

  // ── SpaceMouse 6DOF input state ──────────────────────────────────────
  // `spaceMouseConnected` mirrors the engine's puck state.  The engine
  // fires `input.spaceMouse.onConnectedChange(connected)` from a single
  // site (`spaceMouseSubsystem`'s onConnectionChange callback), covering
  // explicit connect, explicit disconnect, AND unsolicited unplugs /
  // permission revocations — so a single subscription keeps the
  // SettingsPanel's "connected / not connected" indicator authoritative.
  // Seeded with `false` (no puck at startup); the subsystem's silent
  // re-acquire pass will fire the echo asynchronously if a
  // previously-paired device is still attached.
  const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);

  // Sensitivity is App-owned optimistic state: the engine has no echo
  // callback for it (the subsystem's setSensitivity is fire-and-forget),
  // matching the filaments / volumes pattern.  Seeded from
  // `DEFAULT_SPACE_MOUSE_SENSITIVITY` so the slider thumb has a sensible
  // position before the user touches it.
  const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(
    DEFAULT_SPACE_MOUSE_SENSITIVITY,
  );

  // ── POI per-category visibility (two independent axes) ──────────────
  // Engine echoes the full Record<PoiCategory, boolean> per axis on
  // every matching setter call (plus once at init via
  // seedSettingsCallbacks).  Label and marker visibility are kept as two
  // separate records on purpose: conflating them into one axis lets a
  // category hidden on one axis silently suppress it on the other.  Both
  // seed to "all categories on" so first paint matches the engine default.
  const [labelCategoryVisibility, setLabelCategoryVisibility] = useState<
    Record<PoiCategory, boolean>
  >({
    cluster: true,
    supercluster: true,
    famousGalaxy: true,
    void: true,
    group: true,
  });
  const [markerCategoryVisibility, setMarkerCategoryVisibility] = useState<
    Record<PoiCategory, boolean>
  >({
    cluster: true,
    supercluster: true,
    famousGalaxy: true,
    void: true,
    group: true,
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
      showPickBuffer,
      showDiskRadiusRing,
      visibleSourceMask,
      biasMode,
      absMagLimit,
      toneMapCurve,
      exposure,
      volumesEnabled,
      volumeFields,
      labelCategoryVisibility,
      markerCategoryVisibility,
      spaceMouseConnected,
      spaceMouseSensitivity,
      flow,
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
      debug: {
        onShowPickBufferChange: setShowPickBuffer,
        onShowDiskRadiusRingChange: setShowDiskRadiusRing,
      },
      filaments: {
        onReady: (stripCount, vertexCount) => setFilamentCounts({ stripCount, vertexCount }),
      },
      volumes: {
        // Engine pushes the fresh snapshot in its argument, so the
        // mirror is a one-line setter.  Synthetic-fixture handles
        // (`debug-*`) are dropped here — the SettingsPanel only shows
        // real science volumes, but the engine's registry still holds
        // them for dev-console toggling.
        onFieldsChanged: (fields) =>
          setVolumeFields(fields.filter((f) => !f.handle.startsWith('debug-'))),
      },
      labels: {
        // Engine echoes the full record on every toggle; setting React
        // state to the same shape keeps the checkboxes in sync from a
        // single subscription.  Spread to drop the readonly wrapper
        // for React's mutable useState slot.  Two echoes for the two
        // independent axes (split by the 2026-05-19 settings-panel
        // audit, Q11) — flipping one does NOT re-emit the other.
        onLabelCategoryVisibilityChange: (v) => setLabelCategoryVisibility({ ...v }),
        onMarkerCategoryVisibilityChange: (v) => setMarkerCategoryVisibility({ ...v }),
      },
      input: {
        // SpaceMouse connection echo — fires for pair / explicit
        // disconnect / unsolicited HID disconnect.  Without this the
        // "connected" indicator can persist after the puck is gone.
        spaceMouse: {
          onConnectedChange: setSpaceMouseConnected,
        },
      },
    },
    setFilamentsEnabled,
    setFilamentIntensity,
    setExposure,
    setVolumesEnabled,
    setSpaceMouseSensitivity,
    updateFlow,
  };
}
