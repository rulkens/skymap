/**
 * createPlans — one `Plans` store per frame. A `'once'` value keys on the
 * planner's name alone; a `'perView'` value keys additionally by `FrameView`
 * identity (a `WeakMap`, the idiom `atmosphereDrawListCache`/`readStarCut`
 * already use) — there is no view whose plan a DIFFERENT view can read.
 */

import type { ContentPlanner } from '../../../@types/engine/frame/ContentPlanner';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PlanResult } from '../../../@types/engine/frame/PlanResult';
import type { Plans } from '../../../@types/engine/frame/Plans';

export function createPlans(): Plans {
  const once = new Map<string, PlanResult<unknown>>();
  const perView = new Map<string, WeakMap<FrameView, PlanResult<unknown>>>();
  let awake = false;
  let settling = false;

  return {
    get<T>(planner: ContentPlanner<T>, view?: FrameView): T {
      // Keyed on the PLANNER's own scope, not on whether a caller happened to
      // pass a `view` — a `once` value is the same answer for every view.
      const result =
        planner.scope === 'once'
          ? once.get(planner.name)
          : view === undefined
            ? undefined
            : perView.get(planner.name)?.get(view);
      if (result === undefined) {
        throw new Error(
          `Plans.get: '${planner.name}' was never planned${planner.scope === 'once' ? '' : ' for this view'}`,
        );
      }
      return result.value as T;
    },
    put<T>(planner: ContentPlanner<T>, view: FrameView | undefined, result: PlanResult<T>): void {
      if (view === undefined) {
        once.set(planner.name, result);
      } else {
        let byView = perView.get(planner.name);
        if (byView === undefined) {
          byView = new WeakMap();
          perView.set(planner.name, byView);
        }
        byView.set(view, result);
      }
      awake ||= result.awake;
      settling ||= result.settling;
    },
    get awake() {
      return awake;
    },
    get settling() {
      return settling;
    },
  };
}
