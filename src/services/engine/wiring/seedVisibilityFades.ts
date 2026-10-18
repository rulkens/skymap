/**
 * Registers every fade identity at its boot target, so frame 1 draws what the switches and
 * the committed slots say: a disabled thing never flashes in, an ungated enabled one never
 * fades up from 0, and a gated one waits at 0 for its slot.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { visibilityTargetOf } from '../../../utils/visibility/visibilityTargetOf';

export function seedVisibilityFades(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
): void {
  const { settings, visibilityEntries, visibilityGates } = state;
  for (const entry of visibilityEntries) {
    for (const id of fadeIdentitiesOf(entry)) {
      const target = visibilityTargetOf(
        settings,
        visibilityEntries,
        entry,
        id.item,
        visibilityGates,
      );
      state.subsystems.fades.register(id, target);
    }
  }
}
