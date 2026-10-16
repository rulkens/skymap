/**
 * PickDriverDeps — what `createPickDriver` needs. The store is structural so a
 * test hands in a real store without the engine; `state` is the engine's own
 * bag, read for the shared in-flight gate and the terrain-marker debug toggle.
 */

import type { RootState } from '../../../store/types';
import type { PickProgram } from '../frame/PickProgram';
import type { SelectionResolver } from '../selection/SelectionResolver';
import type { EngineState } from '../state/EngineState';

export type PickDriverDeps = {
  readonly store: {
    getState(): RootState;
    dispatch(action: unknown): void;
    subscribe(listener: () => void): () => void;
  };
  readonly pickProgram: PickProgram;
  readonly resolvePick: SelectionResolver['resolvePick'];
  readonly canvas: { readonly clientWidth: number; readonly clientHeight: number };
  readonly state: Pick<EngineState, 'picking' | 'settings' | 'viewRig'>;
  readonly scheduler: { requestRender(): void };
};
