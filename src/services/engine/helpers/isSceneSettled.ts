/**
 * isSceneSettled — has everything the current view asked for arrived? No asset
 * slot loading or committing, no Layer planner voting `settling` last frame (a
 * surface still streaming its tiles), and no fade running. The tour's cold-load
 * gate polls it through `SagaContext.sceneSettled`.
 */
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function isSceneSettled(
  state: Pick<EngineState, 'booted' | 'fadesAnimating' | 'layersSettling' | 'slotsByKey'>,
): boolean {
  if (!state.booted || state.fadesAnimating || state.layersSettling) return false;
  for (const slot of state.slotsByKey.values()) {
    const kind = slot.state().kind;
    if (kind === 'loading' || kind === 'committing') return false;
  }
  return true;
}
