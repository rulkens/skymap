/**
 * UseEngineSettingsState — React-side projection of the engine's
 * settings surface, as exposed by the `useEngineSettings` hook.
 *
 * ### Why this is distinct from `EngineSettingsState`
 *
 * The engine-side `EngineSettingsState` (see
 * `./EngineSettingsState.d.ts`) is the canonical mutable bag living
 * inside the engine closure, organised by *cluster* (`points`,
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

import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { VolumeFieldRowData } from './VolumeFieldRowData';
import type { PoiCategory } from '../../services/engine/subsystems/poiSubsystem';

export type UseEngineSettingsState = {
  pointSize: number;
  brightness: number;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  filamentsEnabled: boolean;
  filamentIntensity: number;
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  visibleSourceMask: number;
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
   * Snapshot of every registered field's UI state — mirrored from the
   * engine via the `volumes.onFieldsChanged(fields)` callback after
   * every mutation.  Synthetic-fixture handles (`debug-*`) are filtered
   * inside the hook so consumers only see real science volumes.  Starts
   * empty (no cubes are registered at startup).
   */
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
  /**
   * Per-category visibility for the POI TEXT LABEL overlay.  Mirrors
   * the engine-side `EngineSettingsState.labelCategoryVisibility`; the
   * SettingsPanel reads from this record to render the per-category
   * label checkboxes.  Engine echoes the whole record on every
   * `handle.labels.setCategoryLabelVisible(cat, visible)` call so the
   * UI stays in sync from a single subscription.
   */
  labelCategoryVisibility: Record<PoiCategory, boolean>;
  /**
   * Per-category visibility for the POI MARKER overlay (ring + halo).
   * Mirrors the engine-side
   * `EngineSettingsState.markerCategoryVisibility`.  Today there is no
   * per-category marker UI — every entry stays `true` unless the
   * Structures master toggle (Task #6 of the 2026-05-19 audit) flips
   * them as a batch.  Kept in state regardless so the React shell can
   * present a snapshot and so the upcoming Structures toggle has a
   * stable mirror to subscribe to.
   */
  markerCategoryVisibility: Record<PoiCategory, boolean>;
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
