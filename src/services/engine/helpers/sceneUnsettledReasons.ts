/**
 * sceneUnsettledReasons — what the current view still waits for, one short phrase
 * each: the engine booting, an asset slot loading or committing, a Layer planner
 * voting `loading` last frame (a surface still streaming its tiles), a fade running.
 * Empty once settled; a tool that times out prints the phrases.
 */
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function sceneUnsettledReasons(
  state: Pick<EngineState, 'booted' | 'fadesAnimating' | 'layersLoading' | 'slotsByKey'>,
): string[] {
  if (!state.booted) return ['engine booting'];
  const reasons: string[] = [];
  if (state.fadesAnimating) reasons.push('fade running');
  if (state.layersLoading) reasons.push('layer streaming');
  for (const [key, slot] of state.slotsByKey) {
    const kind = slot.state().kind;
    if (kind === 'loading' || kind === 'committing') reasons.push(`asset ${String(key)} ${kind}`);
  }
  return reasons;
}
