/**
 * Core's gate for a planner that declares `fade`: hands it the handed value as `plan`'s last
 * argument. Never skips: what it plans feeds passes that run their own gate. A once-scope
 * planner reads the band at the canvas view (`views[0]`), as a once-scope compute does: every
 * view's eye is the frame camera's give or take an eye offset, far below any band's scale.
 * With no view it gets no band. `state` is the engine's own, bound at wrap time.
 */

import type { FrameContentPlanner } from '../../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveFadeValue } from '../presentation/resolveFadeValue';
import { resolveViewFadeValue } from '../presentation/resolveViewFadeValue';

export function gatePlannerByFade<T>(
  planner: FrameContentPlanner<T>,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): FrameContentPlanner<T> {
  const address = planner.fade;
  if (address === undefined) return planner;
  if (planner.scope === 'once') {
    return {
      ...planner,
      plan: (snapshot: ReadyFrameContext, views: readonly FrameView[], s: PassState) =>
        planner.plan(
          snapshot,
          views,
          s,
          views.length > 0
            ? resolveViewFadeValue(state, views[0]!, address)
            : resolveFadeValue(state, snapshot, address),
        ),
    };
  }
  return {
    ...planner,
    plan: (view: FrameView, s: PassState) =>
      planner.plan(view, s, resolveViewFadeValue(state, view, address)),
  };
}
