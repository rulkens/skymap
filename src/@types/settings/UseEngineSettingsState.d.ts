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

import type { FlowSettings } from './FlowSettings';
import type { VolumeFieldRowData } from './VolumeFieldRowData';
import type { LabelCategory } from '../engine/data/LabelCategory';
import type { StructureCategory } from '../engine/data/StructureCategory';

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
  // `useSettingsStore` selectors, so they aren't mirrored here.
  /**
   * Strip + vertex counts from the cosmic-web `filaments.bin`, or `null` until
   * the engine fires `filaments.onReady` (once, after the optional file lands).
   * This is an EVENT payload, not a settings leaf — there is no store home for
   * it — so it stays a mirror cell even though the filaments TOGGLE + INTENSITY
   * migrated to the engine-owned store.
   */
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  /**
   * Master toggle for the scalar-volume overlay.  Mirrors
   * `EngineSettingsState.volumesEnabled` on the engine side.  No echo
   * callback — React owns it optimistically, same as `filamentsEnabled`.
   */
  volumesEnabled: boolean;
  /**
   * Snapshot of every registered field's UI state — mirrored from the
   * engine via the `volumes.onFieldsChanged(fields)` callback after
   * every mutation.  Synthetic-fixture handles (`debug-*`) are filtered
   * inside the hook so consumers only see real science volumes.  Starts
   * empty (no cubes are registered at startup).
   */
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
  /**
   * Per-category visibility for the TEXT LABEL overlay.  A React-side mirror
   * of the engine's derived label-visibility record (structure categories
   * from `structures.items[cat].labelEnabled`, famousGalaxy from the engine's
   * flat label record); the SettingsPanel reads from it to render the
   * per-category label checkboxes.  Engine echoes the whole record on every
   * label toggle so the UI stays in sync from a single subscription.
   */
  labelCategoryVisibility: Record<LabelCategory, boolean>;
  /**
   * Per-category visibility for the MARKER overlay (ring + halo), keyed
   * by `StructureCategory` only.  A React-side mirror of the engine's derived
   * marker-visibility record (each entry from `structures.items[cat].enabled`).
   * Today there is no per-category marker UI — every entry stays `true` unless
   * the Structures master toggle flips them as a batch.  Kept in state
   * regardless so the React shell can present a snapshot and so the Structures
   * toggle has a stable mirror to subscribe to.
   */
  markerCategoryVisibility: Record<StructureCategory, boolean>;
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
  /**
   * App-owned optimistic mirror of `settings.flow` (the CF4++
   * peculiar-velocity overlay).  The engine fires NO echo callback for flow —
   * same pattern as `filamentsEnabled` — so React owns the whole slice
   * directly, seeded from `DEFAULT_FLOW`.  One `FlowSettings` object rather
   * than nine flat fields: the SettingsPanel reads `enabled` / `mode` /
   * `intensity`, the DebugPanel reads the motion knobs, and both write back
   * through a `Partial<FlowSettings>` patch.
   */
  flow: FlowSettings;
};
