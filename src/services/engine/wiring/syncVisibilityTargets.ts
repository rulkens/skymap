/**
 * Recomputes every visibility target after a settings write; drives fades only, never
 * settings. `only` narrows by address and also covers every label whose `of` names one of
 * them, so a cue on a thing ramps its label over the same duration.
 *
 * The wake is asymmetric: a snap (`animate: false`) uses `setImmediate`, which does not wake,
 * so the whole batch issues one `requestRender`; an animated batch issues none, since every
 * `fadeTo` wakes the scheduler itself.
 */

import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { fadeIdentitiesOf } from '../../../utils/visibility/fadeIdentitiesOf';
import { ofLabelsOf } from '../../../utils/visibility/ofLabelsOf';
import { visibilityEntryOf } from '../../../utils/visibility/visibilityEntryOf';
import { applyVisibilityTarget } from './applyVisibilityTarget';

export function syncVisibilityTargets(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  opts: {
    readonly animate: boolean;
    readonly only?: readonly VisibilityAddress[];
    readonly durationMs?: number;
  },
): void {
  const all = state.visibilityEntries;
  // A Set: an `only` naming both a thing and its label would otherwise visit the label twice.
  const entries =
    opts.only === undefined
      ? all
      : new Set(opts.only.flatMap((a) => [visibilityEntryOf(all, a), ...ofLabelsOf(all, a)]));
  for (const entry of entries) {
    for (const id of fadeIdentitiesOf(entry)) applyVisibilityTarget(state, entry, id, opts);
  }
  if (!opts.animate) state.subsystems.scheduler.requestRender();
}
