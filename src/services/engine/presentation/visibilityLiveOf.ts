import type { FadeIdentity } from '../../../@types/animation/FadeIdentity';
import type { EngineState } from '../../../@types/engine/state/EngineState';

/** The one liveness predicate: heading for 1, or the RAW fade still above 0. Raw, not the
 * handed value: a clip or recession at 0 must not cut a switched-off label's fade-out tail. */
export function visibilityLiveOf(
  state: Pick<EngineState, 'subsystems'>,
  id: FadeIdentity,
  nowMs: number,
): boolean {
  const { fades } = state.subsystems;
  return fades.targetOf(id) === 1 || fades.opacityOf(id, nowMs) > 0;
}
