/**
 * The `EngineState` shape after `isEngineReady` returns `true`: the two GPU
 * handles that predicate proves non-null. Built via TypeScript intersection
 * so the canonical `EngineState` declaration stays untouched. See
 * `services/engine/helpers/engineReady.ts` for which handles this narrows
 * and why the galaxy/textured-disk ones are not among them.
 */

import type { EngineState } from './state/EngineState';
import type { Compositor } from '../rendering/Compositor';
import type { RenderTargets } from '../rendering/RenderTargets';

export type ReadyEngineState = EngineState & {
  gpu: EngineState['gpu'] & {
    compositor: Compositor;
    renderTargets: RenderTargets;
  };
};
