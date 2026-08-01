/**
 * AppState — the galaxy-renderer store's full root shape: the four
 * generator/render param sets (`galaxy`/`render`/`lod`/`fieldTuning`, each a
 * single-action "patch" slice — see `src/state/slices/`) plus the UI-adjacent
 * state that doesn't belong on the generator itself: the compare panel's live
 * session (`compare`), the extra-galaxies scatter toggle (`extras`), and app
 * chrome (`ui`).
 *
 * `galaxy`/`render`/`lod`/`fieldTuning` reuse the plain data types the engine
 * already consumes (`GalaxyParams`/`RenderSettings`/`LodSettings`/
 * `GalaxyFieldTuning`) verbatim — the store holds exactly what the engine
 * wants, no UI-only wrapper fields, so a `paramsPatched` payload is always a
 * subset of the engine's own knob shape.
 *
 * `createStore.ts` mounts all seven routes and carries a compile-time
 * trip-wire keeping its reducer map's combined state equal to this type —
 * add a field here and the reducer map must grow to match, or the build
 * breaks in `createStore.ts`, not silently at some call site.
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
