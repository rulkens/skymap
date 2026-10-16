/**
 * Recomputes ONE identity's target, plus the same item of every label whose `of` names it,
 * animated over the default durations. A gating slot notifies through this: retargeting the
 * whole entry would let catalog A's commit restart catalog B's in-flight tier-swap ramp.
 */

import type { FadeIdentity } from '../../../@types/animation/FadeIdentity';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { ofLabelsOf } from '../../../utils/visibility/ofLabelsOf';
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { applyVisibilityTarget } from './applyVisibilityTarget';

export function syncVisibilityTarget(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  id: FadeIdentity,
): void {
  const entries = state.visibilityEntries;
  applyVisibilityTarget(state, visibilityEntryOf(entries, id.address), id, { animate: true });
  for (const label of ofLabelsOf(entries, id.address)) {
    const follows =
      id.item === undefined ? label.items === undefined : label.items?.includes(id.item) === true;
    if (!follows) continue;
    const labelId = { address: visibilityAddressOf(label), item: id.item };
    applyVisibilityTarget(state, label, labelId, { animate: true });
  }
}
