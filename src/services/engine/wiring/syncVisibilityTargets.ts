/**
 * Recomputes every visibility target after a settings write; drives fades only, never
 * settings. Every entry, `of` labels included, so a cue on a thing ramps its label over the
 * same duration.
 *
 * `overMs` is a cue's duration (`0` snaps, `undefined` takes the default durations).
 * The wake is asymmetric: a snap uses `setImmediate`, which does not wake,
 * so the whole batch issues one `requestRender`; an animated batch issues none, since every
 * `fadeTo` wakes the scheduler itself.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { applyVisibilityTarget } from './applyVisibilityTarget';

export function syncVisibilityTargets(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  overMs?: number,
): void {
  for (const entry of state.visibilityEntries) {
    for (const id of fadeIdentitiesOf(entry)) applyVisibilityTarget(state, entry, id, overMs);
  }
  if (overMs === 0) state.subsystems.scheduler.requestRender();
}
