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
  // Every SETTING moved to the engine-owned store and is read React-side via
  // `useSettingsStore` selectors, so no settings leaf is mirrored here. The
  // three fields below are the non-settings remainder: `filamentCounts` is an
  // EVENT payload (no store home), and the two SpaceMouse fields are the input
  // subsystem's React-owned state.
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
   * no echo callback for sensitivity, so React is the source of truth.
   * It is NOT in `EngineSettingsState`, so it does not move to the store.
   */
  spaceMouseSensitivity: number;
};
