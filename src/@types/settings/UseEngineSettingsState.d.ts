/**
 * UseEngineSettingsState — React-side projection of the engine's
 * settings surface, as exposed by the `useEngineSettings` hook.
 *
 * ### Why this is distinct from `EngineSettingsState`
 *
 * The engine-side `EngineSettingsState` (see
 * `./EngineSettingsState.d.ts`) is the canonical mutable bag living
 * inside the engine closure, organised by *cluster* (`surveys`,
 * `tonemap`, `camera`, `bias`, `thumbnails`, `milkyWay`, `filaments`,
 * `volumes`) so every cluster mirrors a sub-handle namespace 1:1.
 *
 * `UseEngineSettingsState` is the *flat* projection App.tsx and
 * SettingsPanel.tsx prefer to consume — one named field per knob, no
 * cluster wrapping.  The hook fans the engine's nested echoes back
 * into individual `useState` cells, then exposes their current values
 * as this flat record so JSX can read them directly.
 *
 * Prior to this PR both shapes shared the name `EngineSettingsState`;
 * one lived in `@types/EngineSettingsState.d.ts`, the other in
 * `hooks/useEngineSettings.ts`.  The collision made it impossible to
 * deep-import "the settings state type" without first knowing which
 * side of the engine boundary you were on.  Renaming the React-side
 * to `UseEngineSettingsState` ("the state that the `use…` hook
 * returns") breaks the collision while keeping the engine-side
 * canonical name unchanged.
 */

export type UseEngineSettingsState = {
  // The surveys cluster (pointSize, brightness, depthFade, highlightFallback,
  // realOnly, visibleSourceMask), the tonemap cluster (exposure, curve), camera
  // auto-rotate, and the bias cluster (mode, absMagLimit) are no longer mirrored
  // here — App.tsx reads them off the engine-owned store via `useSettingsStore`
  // selectors. The galaxy-thumbnail master toggle also moved to the store but
  // has no React consumer (the panel surface was evicted), so it isn't surfaced
  // here at all. The Milky-Way disk toggle likewise moved to the store and has
  // no React consumer (its handle setter has no panel caller), so it isn't
  // surfaced here either. The filaments cluster (enabled / intensity) also moved
  // to the store; App.tsx + StatsPanel read it via `useSettingsStore` selectors,
  // so neither leaf is mirrored here — but `filamentCounts` below stays (it's an
  // EVENT payload, not a settings mirror). The debug overlays (showPickBuffer /
  // showDiskRadiusRing) also moved to the store; the DebugPanel reads them via
  // `useSettingsStore` selectors, so they aren't mirrored here. The volumes
  // cluster (master `enabled` + per-field `items`) also moved to the store;
  // App.tsx reads the master via `selectVolumesEnabled` and the per-field rows
  // via `selectVolumeFieldItems` + a `useMemo` projection, so neither is
  // mirrored here. The structures / labels cluster (per-category marker + label
  // visibility, plus the famousGalaxy survey label) also moved to the store;
  // App.tsx reads the marker record via `selectStructureItems` + a projection
  // and the label record via `selectStructureItems` + `selectSurveyItems` + a
  // projection, so neither derived record is mirrored here.
  /**
   * Strip + vertex counts from the cosmic-web `filaments.bin`, or `null` until
   * the engine fires `filaments.onReady` (once, after the optional file lands).
   * This is an EVENT payload, not a settings leaf — there is no store home for
   * it — so it stays a mirror cell even though the filaments TOGGLE + INTENSITY
   * migrated to the engine-owned store.
   */
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  /**
   * Whether a 3Dconnexion SpaceMouse is currently paired and feeding
   * input reports.  Engine echoes this through
   * `EngineCallbacks.input.spaceMouse.onConnectedChange` on every
   * connect / disconnect transition (including unsolicited unplugs).
   */
  spaceMouseConnected: boolean;
  /**
   * Current SpaceMouse global sensitivity multiplier (applied AFTER the
   * cube response curve).  App-owned optimistic state — the engine has
   * no echo callback for sensitivity, so React is the source of truth
   * (same pattern as `filamentsEnabled` / `volumesEnabled`).
   */
  spaceMouseSensitivity: number;
};
