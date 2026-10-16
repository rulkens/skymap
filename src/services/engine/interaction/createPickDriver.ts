/**
 * createPickDriver — answers the `input` slice's hover and select requests with
 * GPU picks. Both slots share one in-flight gate (`picking.pickInFlight`):
 * `pickProgram.pick` resolves null for a second call while one is in flight, so
 * a tap racing a hover pick would otherwise deselect. When a pick settles the
 * driver re-reads the store and fires the newest pending request, select first —
 * the readback latency is the throttle, and moves made meanwhile coalesce in the
 * slice into one trailing pick at the newest point. Hover never wakes the loop;
 * only the terrain-pick debug marker does.
 */

import { cssToTexPx } from '../helpers/cssToTexPx';
import { unitToViewPx } from '../../../utils/input/unitToViewPx';
import { selectPickRequests } from '../../../state/input/selectors';
import { inputPickResolved } from '../../../state/input/inputSlice';
import {
  updateSelectionHover,
  updateSelectionSelect,
} from '../../../state/selection/selectionSlice';
import { VIEW_RIGS } from '../../../data/rendering/viewRigs';
import type { PickDriverDeps } from '../../../@types/engine/interaction/PickDriverDeps';
import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { UnitPoint } from '../../../@types/input/UnitPoint';
import type { Vec2 } from '../../../@types/math/Vec2';

export function createPickDriver(deps: PickDriverDeps): Destroyable {
  const { store, state } = deps;
  // The last request seq taken per slot; seqs start at 1, so 0 means "none yet".
  const taken = { hover: 0, select: 0 };
  let markedHoverSeq = 0;
  let live = true;

  const texPxOf = (at: UnitPoint): Vec2 => {
    const [x, y] = unitToViewPx(at, [deps.canvas.clientWidth, deps.canvas.clientHeight]);
    return [cssToTexPx(x), cssToTexPx(y)];
  };

  // Follows the cursor even while a pick is in flight: the marker is drawn, not picked.
  function moveTerrainMarker(): void {
    const hover = selectPickRequests(store.getState()).hover;
    if (!hover?.at || hover.seq === markedHoverSeq) return;
    markedHoverSeq = hover.seq;
    if (!state.settings.debug.overlays['terrain-pick-marker']) return;
    // A dome frame has no single cursor ray, so the marker pass must keep seeing null there.
    if (!VIEW_RIGS[state.viewRig].pickable) return;
    state.picking.cursorTexPx = texPxOf(hover.at);
    deps.scheduler.requestRender();
  }

  function pump(): void {
    while (live && !state.picking.pickInFlight) {
      const requests = selectPickRequests(store.getState());
      const which =
        requests.select && requests.select.seq !== taken.select
          ? 'select'
          : requests.hover && requests.hover.seq !== taken.hover
            ? 'hover'
            : null;
      if (which === null) return;
      const { at, seq } = requests[which]!;
      // Taken before any dispatch: each dispatch re-enters `pump` through the subscription.
      taken[which] = seq;
      if (at === null) {
        store.dispatch(updateSelectionHover(null));
        store.dispatch(inputPickResolved({ which, seq }));
        continue;
      }
      fire(which, at, seq);
    }
  }

  function fire(which: 'hover' | 'select', at: UnitPoint, seq: number): void {
    state.picking.pickInFlight = true;
    const [x, y] = texPxOf(at);
    deps.pickProgram
      .pick(x, y)
      .then((hit) => {
        const ref = deps.resolvePick(hit);
        store.dispatch(which === 'hover' ? updateSelectionHover(ref) : updateSelectionSelect(ref));
      })
      .catch(() => {
        // A failed readback is no answer: the prior selection stands.
      })
      .finally(() => {
        state.picking.pickInFlight = false;
        if (!live) return;
        store.dispatch(inputPickResolved({ which, seq }));
        pump();
      });
  }

  const unsubscribe = store.subscribe(() => {
    moveTerrainMarker();
    pump();
  });

  return {
    destroy() {
      live = false;
      unsubscribe();
    },
  };
}
