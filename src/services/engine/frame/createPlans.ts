/**
 * createPlans — one `FramePlannerResultStore` per frame. A `'once'` value keys on the
 * planner's name alone; a `'perView'` value keys additionally by `FrameView`
 * identity (a `WeakMap`, the idiom `atmosphereDrawListCache`/`readStarCut`
 * already use) — there is no view whose plan a DIFFERENT view can read.
 */

import type { FrameContentPlanner } from '../../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { PlannerResult } from '../../../@types/engine/frame/PlannerResult';
import type { FramePlannerResultStore } from '../../../@types/engine/frame/FramePlannerResultStore';

export function createPlans(): FramePlannerResultStore {
  const once = new Map<string, PlannerResult<unknown>>();
  const perView = new Map<string, WeakMap<FrameView, PlannerResult<unknown>>>();
  let awake = false;
  let settling = false;

  return {
    get<T>(planner: FrameContentPlanner<T>, view?: FrameView): T {
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
          `FramePlannerResultStore.get: '${planner.name}' was never planned${planner.scope === 'once' ? '' : ' for this view'}`,
        );
      }
      return result.value as T;
    },
    put<T>(
      planner: FrameContentPlanner<T>,
      view: FrameView | undefined,
      result: PlannerResult<T>,
    ): void {
      // Keyed on the PLANNER's own scope, the same discriminant `get` reads —
      // the view only supplies the `perView` key.
      if (planner.scope === 'once') {
        once.set(planner.name, result);
      } else {
        let byView = perView.get(planner.name);
        if (byView === undefined) {
          byView = new WeakMap();
          perView.set(planner.name, byView);
        }
        // A `perView` row is only ever put against its own view; a missing one
        // throws on the WeakMap key rather than landing where no `get` looks.
        byView.set(view!, result);
      }
      // A settling vote keeps the loop ticking too — `awake ⊇ settling` is
      // PlannerResult's convention, and this fold is what owns the implication.
      awake ||= result.awake || result.settling;
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
