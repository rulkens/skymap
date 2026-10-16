/**
 * Moves one identity's fade toward its recomputed target. A target already held is never
 * re-issued, so a recompute cannot restart a ramp in flight toward it. Never wakes the
 * scheduler itself: `fadeTo` does, and a snap leaves the wake to its batch.
 */

import type { FadeIdentity } from '../../../@types/animation/FadeIdentity';
import type { VisibilityEntry } from '../../../@types/engine/layer/VisibilityEntry';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { visibilityTargetOf } from '../../../utils/visibility/visibilityTargetOf';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';

export function applyVisibilityTarget(
  state: Pick<EngineState, 'settings' | 'subsystems' | 'visibilityEntries' | 'visibilityGates'>,
  entry: VisibilityEntry,
  id: FadeIdentity,
  opts: { readonly animate: boolean; readonly durationMs?: number },
): void {
  const { fades } = state.subsystems;
  const target = visibilityTargetOf(
    state.settings,
    state.visibilityEntries,
    entry,
    id.item,
    state.visibilityGates,
  );
  if (fades.targetOf(id) === target) return;
  if (!opts.animate) {
    fades.setImmediate(id, target);
    return;
  }
  const durationMs = opts.durationMs ?? (target === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS);
  void fades.fadeTo(id, target, durationMs);
}
