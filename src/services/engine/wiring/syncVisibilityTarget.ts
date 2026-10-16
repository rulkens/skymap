/**
 * Recomputes ONE identity's target, plus the same item of every label whose `of` names it,
 * animated over the default durations. A gating slot notifies through this: retargeting the
 * whole entry would let catalog A's commit restart catalog B's in-flight tier-swap ramp.
 */

import type { FadeIdentity } from '../../../@types/animation/FadeIdentity';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';
import { applyVisibilityTarget } from './applyVisibilityTarget';

export function syncVisibilityTarget(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  id: FadeIdentity,
): void {
  for (const entry of state.visibilityEntries) {
    const address = visibilityAddressOf(entry);
    if (address === id.address) {
      applyVisibilityTarget(state, entry, id, { animate: true });
    } else if (
      'label' in entry &&
      entry.of === id.address &&
      (id.item === undefined ? entry.items === undefined : entry.items?.includes(id.item) === true)
    ) {
      applyVisibilityTarget(state, entry, { address, item: id.item }, { animate: true });
    }
  }
}
