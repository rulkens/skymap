/**
 * engineSettingsStore — the single source of truth for the engine's
 * user-facing render settings (the `EngineState.settings.*` bag).
 *
 * ### The seam this owns
 *
 * Settings are bidirectional and the engine is authoritative:
 *
 *   - React writes via the engine handle (`handle.points.setBrightness`) —
 *     never directly into this store.  The engine setter clamps / triggers
 *     side effects and THEN writes the store.
 *   - The engine reads its own settings back from this store, both in the
 *     per-frame hot loop (`runFrame` → `RenderFrameSettings`) and from
 *     subsystems (e.g. `biasCorrectionSubsystem.getMode`).
 *   - React reads via the per-field `useX` selector hooks.
 *
 * Making this the single source of truth means the field leaves
 * `EngineState.settings` entirely (no mirror copy) and the old echo
 * machinery — the `settingsTable` callback half, the `useEngineSettings`
 * mirror `useState`s, the `seedSettingsCallbacks` fan-out, and the echo
 * half of `EngineCallbacks` — is deleted as each field migrates.  See
 * `docs/superpowers/plans/2026-05-22-settings-store-migration.md`.
 *
 * ### Why vanilla zustand, and why `useSyncExternalStore` not `useStore`
 *
 * Vanilla zustand has no React dependency, so the engine importing this
 * is lateral to the `EngineCallbacks` coupling it already carries — a
 * pub/sub cell, not a UI framework.  The selector hooks bind with React's
 * own `useSyncExternalStore` using `getState` for BOTH snapshots: skymap
 * is a client-only SPA (no SSR hydration), and zustand's own `useStore`
 * passes `getInitialState` as the server snapshot, which would report the
 * initial value under the project's `renderToStaticMarkup` test
 * convention.  Same rationale as `engineTelemetryStore.ts`.
 *
 * ### Flat shape
 *
 * Fields are flat (not clustered like `state.settings.points.*`) to match
 * `RenderFrameSettings`, which the hot loop already builds flat — the
 * per-frame read is one `getState()` deref then plain field reads.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { BiasMode } from '../data/biasMode';
import { Source, SOURCE_REGISTRY } from '../data/sources';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
} from '../data/defaults';
import type { BiasMode as BiasModeT } from '../@types/data/BiasMode';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';

type EngineSettingsState = {
  // points cluster
  pointSize: number;
  brightness: number;
  highlightFallback: boolean;
  realOnly: boolean;
  depthFade: boolean;
  // tonemap cluster
  exposure: number;
  toneMapCurve: ToneMapCurveT;
  // camera cluster
  autoRotate: boolean;
  // bias cluster (mode migrated by the spike; absMagLimit follows)
  biasMode: BiasModeT;
  absMagLimit: number;
  // single-leaf clusters
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  filamentsEnabled: boolean;
  filamentIntensity: number;
  volumesMasterEnabled: boolean;

  setPointSize: (v: number) => void;
  setBrightness: (v: number) => void;
  setHighlightFallback: (v: boolean) => void;
  setRealOnly: (v: boolean) => void;
  setDepthFade: (v: boolean) => void;
  setExposure: (v: number) => void;
  setToneMapCurve: (v: ToneMapCurveT) => void;
  setAutoRotate: (v: boolean) => void;
  setBiasMode: (v: BiasModeT) => void;
  setAbsMagLimit: (v: number) => void;
  setGalaxyTexturesEnabled: (v: boolean) => void;
  setMilkyWayEnabled: (v: boolean) => void;
  setFilamentsEnabled: (v: boolean) => void;
  setFilamentIntensity: (v: number) => void;
  setVolumesMasterEnabled: (v: boolean) => void;
};

const initialState = () => ({
  pointSize: DEFAULT_POINT_SIZE_PX,
  brightness: DEFAULT_BRIGHTNESS,
  highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
  realOnly: DEFAULT_REAL_ONLY_MODE,
  depthFade: DEFAULT_DEPTH_FADE_ENABLED,
  exposure: DEFAULT_EXPOSURE,
  toneMapCurve: DEFAULT_TONE_MAP_CURVE,
  autoRotate: DEFAULT_AUTO_ROTATE,
  biasMode: DEFAULT_BIAS_MODE as BiasModeT,
  absMagLimit: DEFAULT_ABS_MAG_LIMIT,
  galaxyTexturesEnabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
  milkyWayEnabled: DEFAULT_MILKY_WAY_ENABLED,
  filamentsEnabled: SOURCE_REGISTRY[Source.Filaments].visible,
  filamentIntensity: SOURCE_REGISTRY[Source.Filaments].intensity,
  volumesMasterEnabled: DEFAULT_VOLUMES_ENABLED,
});

export const engineSettingsStore = createStore<EngineSettingsState>((set) => ({
  ...initialState(),
  setPointSize: (pointSize) => set({ pointSize }),
  setBrightness: (brightness) => set({ brightness }),
  setHighlightFallback: (highlightFallback) => set({ highlightFallback }),
  setRealOnly: (realOnly) => set({ realOnly }),
  setDepthFade: (depthFade) => set({ depthFade }),
  setExposure: (exposure) => set({ exposure }),
  setToneMapCurve: (toneMapCurve) => set({ toneMapCurve }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setBiasMode: (biasMode) => set({ biasMode }),
  setAbsMagLimit: (absMagLimit) => set({ absMagLimit }),
  setGalaxyTexturesEnabled: (galaxyTexturesEnabled) => set({ galaxyTexturesEnabled }),
  setMilkyWayEnabled: (milkyWayEnabled) => set({ milkyWayEnabled }),
  setFilamentsEnabled: (filamentsEnabled) => set({ filamentsEnabled }),
  setFilamentIntensity: (filamentIntensity) => set({ filamentIntensity }),
  setVolumesMasterEnabled: (volumesMasterEnabled) => set({ volumesMasterEnabled }),
}));

/**
 * Test-only reset.  The store is a module singleton shared by every test
 * in a file (vitest isolates module registries per file, so this is not a
 * cross-file concern); call from `afterEach` so cases don't leak settings
 * into one another.
 */
export const resetEngineSettingsStore = (): void => {
  engineSettingsStore.setState(initialState());
};

export { BiasMode };

// ── Selector hooks ─────────────────────────────────────────────────────────
// Each re-renders its caller only when its own slice changes.  Bound with
// useSyncExternalStore (getState for both snapshots) — see module header.
const makeHook = <T>(select: (s: EngineSettingsState) => T) => (): T =>
  useSyncExternalStore(
    engineSettingsStore.subscribe,
    () => select(engineSettingsStore.getState()),
    () => select(engineSettingsStore.getState()),
  );

export const usePointSize = makeHook((s) => s.pointSize);
export const useBrightness = makeHook((s) => s.brightness);
export const useHighlightFallback = makeHook((s) => s.highlightFallback);
export const useRealOnly = makeHook((s) => s.realOnly);
export const useDepthFade = makeHook((s) => s.depthFade);
export const useExposure = makeHook((s) => s.exposure);
export const useToneMapCurve = makeHook((s) => s.toneMapCurve);
export const useAutoRotate = makeHook((s) => s.autoRotate);
export const useBiasMode = makeHook((s) => s.biasMode);
export const useAbsMagLimit = makeHook((s) => s.absMagLimit);
export const useGalaxyTexturesEnabled = makeHook((s) => s.galaxyTexturesEnabled);
export const useMilkyWayEnabled = makeHook((s) => s.milkyWayEnabled);
export const useFilamentsEnabled = makeHook((s) => s.filamentsEnabled);
export const useFilamentIntensity = makeHook((s) => s.filamentIntensity);
export const useVolumesMasterEnabled = makeHook((s) => s.volumesMasterEnabled);
