/**
 * engineSettingsStore — the single source of truth for the engine's
 * user-facing render settings (the `EngineState.settings.*` bag), kept in
 * the SAME layered/clustered shape as `EngineSettingsState` rather than
 * flattened, so the store reads as a relocation of that tree, not a
 * re-modelling of it.
 *
 * ### The seam this owns
 *
 * Settings are bidirectional and the engine is authoritative:
 *
 *   - React writes via the engine handle (`handle.points.setBrightness`) —
 *     never directly into this store.  The engine setter clamps / triggers
 *     side effects and THEN writes the store.
 *   - The engine reads its own settings back from this store, both in the
 *     per-frame hot loop (`runFrame`) and from subsystems
 *     (e.g. `biasCorrectionSubsystem.getMode`).
 *   - React reads via the generic `useEngineSetting` selector hook.
 *
 * Making this the single source of truth means each field leaves
 * `EngineState.settings` entirely (no mirror copy) and the old echo
 * machinery is deleted as the field migrates.  See
 * `docs/superpowers/plans/2026-05-22-settings-store-migration.md`.
 *
 * ### One generic interface, not 15 setters/selectors
 *
 * Rather than a `setX`/`useX` pair per field, the store exposes:
 *
 *   - `update(cluster, key, value)` — one type-safe generic setter.  The
 *     `<C, K>` signature keeps `value` pinned to the leaf's type, so
 *     `update('bias', 'mode', BiasMode.None)` is checked and
 *     `update('bias', 'mode', 3)` is a compile error.  It maps 1:1 onto
 *     `settingsTable`'s existing `['settings', cluster, leaf]` path
 *     tuples, which is what lets the table route a row to the store with
 *     a single `storePath` field.
 *   - `useEngineSetting(selector)` — one generic React selector hook.
 *     `const mode = useEngineSetting((s) => s.bias.mode)` re-renders the
 *     caller only when that leaf changes.  Select primitives (leaves),
 *     not whole clusters, so the `Object.is` bail-out is meaningful.
 *
 * ### Why vanilla zustand + `useSyncExternalStore` (not `useStore`)
 *
 * Vanilla zustand has no React dependency, so the engine importing this
 * is lateral to the `EngineCallbacks` coupling it already carries.  The
 * selector hook binds with React's own `useSyncExternalStore` using
 * `getState` for BOTH snapshots — skymap is a client-only SPA (no SSR
 * hydration), and zustand's own `useStore` would report the initial
 * value under the project's `renderToStaticMarkup` test convention.
 * Same rationale as `engineTelemetryStore.ts`.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
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

/**
 * The layered settings tree — mirrors `EngineSettingsState`'s clusters.
 * Fields land here as they migrate; until then a cluster's value is the
 * dormant default (never read, because the live read still goes through
 * `EngineState.settings`).
 */
export type SettingsValues = {
  points: {
    sizePx: number;
    brightness: number;
    highlightFallback: boolean;
    realOnly: boolean;
    depthFade: boolean;
  };
  tonemap: { exposure: number; curve: ToneMapCurveT };
  camera: { autoRotate: boolean };
  bias: { mode: BiasModeT; absMagLimit: number };
  thumbnails: { enabled: boolean };
  milkyWay: { enabled: boolean };
  filaments: { enabled: boolean; intensity: number };
  volumes: { masterEnabled: boolean };
};

/**
 * A `[cluster, key]` address into the settings tree — the type-safe
 * argument pair `update` accepts and the shape `settingsTable` rows use
 * via `storePath`.  Distributed over the union of clusters so each
 * `cluster` only admits its own `key`s.
 */
export type SettingsStorePath = {
  [C in keyof SettingsValues]: readonly [C, keyof SettingsValues[C]];
}[keyof SettingsValues];

type EngineSettingsStore = SettingsValues & {
  /**
   * Generic setter: write one leaf, preserving the cluster's siblings.
   * Authoritative writers only (engine handle setters / the settings
   * table); React reads via `useEngineSetting`.
   */
  update: <C extends keyof SettingsValues, K extends keyof SettingsValues[C]>(
    cluster: C,
    key: K,
    value: SettingsValues[C][K],
  ) => void;
};

const initialValues = (): SettingsValues => ({
  points: {
    sizePx: DEFAULT_POINT_SIZE_PX,
    brightness: DEFAULT_BRIGHTNESS,
    highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
    realOnly: DEFAULT_REAL_ONLY_MODE,
    depthFade: DEFAULT_DEPTH_FADE_ENABLED,
  },
  tonemap: { exposure: DEFAULT_EXPOSURE, curve: DEFAULT_TONE_MAP_CURVE },
  camera: { autoRotate: DEFAULT_AUTO_ROTATE },
  bias: { mode: DEFAULT_BIAS_MODE as BiasModeT, absMagLimit: DEFAULT_ABS_MAG_LIMIT },
  thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
  milkyWay: { enabled: DEFAULT_MILKY_WAY_ENABLED },
  filaments: {
    enabled: SOURCE_REGISTRY[Source.Filaments].visible,
    intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
  },
  volumes: { masterEnabled: DEFAULT_VOLUMES_ENABLED },
});

export const engineSettingsStore = createStore<EngineSettingsStore>((set) => ({
  ...initialValues(),
  update: (cluster, key, value) =>
    // The computed-key partial isn't statically provable against the
    // store type (the same bounded cast the old `setByPath` carried);
    // the `<C, K>` signature guarantees it at every call site.
    set((s) => ({ [cluster]: { ...s[cluster], [key]: value } }) as Partial<EngineSettingsStore>),
}));

/**
 * Test-only reset.  The store is a module singleton shared by every test
 * in a file (vitest isolates module registries per file); call from
 * `afterEach` so cases don't leak settings into one another.
 */
export const resetEngineSettingsStore = (): void => {
  engineSettingsStore.setState(initialValues());
};

/**
 * Generic React selector hook.  Re-renders the caller only when the
 * selected value changes (`Object.is`).  Bound with `useSyncExternalStore`
 * using `getState` for both snapshots — see module header.
 *
 *   const brightness = useEngineSetting((s) => s.points.brightness);
 */
export const useEngineSetting = <T>(selector: (s: SettingsValues) => T): T =>
  useSyncExternalStore(
    engineSettingsStore.subscribe,
    () => selector(engineSettingsStore.getState()),
    () => selector(engineSettingsStore.getState()),
  );
