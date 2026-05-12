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

import type { LodMode } from '../data/LodMode';
import type { BiasMode } from '../../data/biasMode';
import type { ToneMapCurve } from '../../data/toneMapCurve';
import type { VolumeFieldRowData } from './VolumeFieldRowData';

export type UseEngineSettingsState = {
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
