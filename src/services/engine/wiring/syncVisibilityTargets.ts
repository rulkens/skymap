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
import { visibilityAddressOf } from '../../../utils/visibility/visibilityAddressOf';
import { applyVisibilityTarget } from './applyVisibilityTarget';

export function syncVisibilityTargets(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  opts: {
    readonly animate: boolean;
    readonly only?: readonly VisibilityAddress[];
    readonly durationMs?: number;
  },
): void {
  const only = opts.only === undefined ? undefined : new Set<string>(opts.only);
  for (const entry of state.visibilityEntries) {
    const covered =
      only === undefined ||
      only.has(visibilityAddressOf(entry)) ||
      ('label' in entry && entry.of !== undefined && only.has(entry.of));
    if (!covered) continue;
    for (const id of fadeIdentitiesOf(entry)) applyVisibilityTarget(state, entry, id, opts);
  }
  if (!opts.animate) state.subsystems.scheduler.requestRender();
}
