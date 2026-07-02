/**
 * AppState — the galaxy-renderer store's full root shape: the three
 * generator/render param sets (`galaxy`/`render`/`lod`, each a single-action
 * "patch" slice — see `src/state/slices/`) plus the UI-adjacent state that
 * doesn't belong on the generator itself: the compare panel's live session
 * (`compare`), the extra-galaxies scatter toggle (`extras`), and app chrome
 * (`ui`).
 *
 * `galaxy`/`render`/`lod` reuse the plain data types the engine already
 * consumes (`GalaxyParams`/`RenderSettings`/`LodSettings`) verbatim — the
 * store holds exactly what the engine wants, no UI-only wrapper fields, so a
 * `paramsPatched` payload is always a subset of the engine's own knob shape.
 *
 * `createStore.ts` mounts `galaxy`/`render`/`lod` now (plan 03 Task 1+2);
 * `compare`/`extras`/`ui` land in Task 3. Until then the store's actual
 * derived state is a strict subset of this type — see the "clear seam" note
 * in `createStore.ts`.
 */

import type { GalaxyParams } from '../model/GalaxyParams';
import type { RenderSettings } from '../engine/RenderSettings';
import type { LodSettings } from '../engine/LodSettings';
import type { CompareState } from './CompareState';
import type { ExtrasState } from './ExtrasState';
import type { UiState } from './UiState';

export type AppState = {
  readonly galaxy: GalaxyParams; // the full param set incl. the four seeds
  readonly render: RenderSettings;
  readonly lod: LodSettings;
  readonly compare: CompareState;
  readonly extras: ExtrasState;
  readonly ui: UiState;
};
