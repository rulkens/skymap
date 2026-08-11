/**
 * AppState — the galaxy-renderer store's full root shape: the four
 * generator/render param sets (each a single-action "patch" slice, see
 * `src/state/slices/`) plus UI-adjacent state (`compare`/`extras`/`ui`).
 *
 * `galaxy`/`render`/`lod`/`fieldTuning` reuse the engine's own data types
 * verbatim, so a `paramsPatched` payload is always a subset of the engine's
 * knob shape. `createStore.ts` carries a compile-time trip-wire keeping its
 * reducer map's combined state equal to this type.
 */

import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyFieldTuning } from '../../../../src/@types/galaxy/GalaxyFieldTuning';
import type { RenderSettings } from '../engine/RenderSettings';
import type { LodSettings } from '../engine/LodSettings';
import type { CompareState } from './CompareState';
import type { ExtrasState } from './ExtrasState';
import type { UiState } from './UiState';

export type AppState = {
  readonly galaxy: GalaxyParams; // the full param set incl. the four seeds
  readonly render: RenderSettings;
  readonly lod: LodSettings;
  readonly fieldTuning: GalaxyFieldTuning;
  readonly compare: CompareState;
  readonly extras: ExtrasState;
  readonly ui: UiState;
};
