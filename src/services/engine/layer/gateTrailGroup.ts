/**
 * Binds one trail group's show key to core's fade resolution, per view so the entry's
 * distance bands apply. `PassState` carries no `visibilityEntries`, so the pass could not
 * resolve a per-group fade itself; `state` is the engine's own, read on each call.
 */

import type { ShowKey } from '../../../@types/animation/ShowKey';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { GatedTrailGroup } from '../../../@types/engine/frame/GatedTrailGroup';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveVisibilityOpacity } from '../presentation/resolveVisibilityOpacity';
import { viewBandOf } from '../presentation/viewBandOf';

export function gateTrailGroup<G extends { readonly show: ShowKey }>(
  group: G,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): GatedTrailGroup<G> {
  return {
    ...group,
    // A trail group's show entry has no items, so its handed value is one number:
    // `resolveViewFadeValue`'s scalar branch, written out because `ShowKey` is not
    // narrowed here.
    fade: (view: FrameView) =>
      resolveVisibilityOpacity(state, view.snapshot, group.show) *
      viewBandOf(state.visibilityEntries, group.show, undefined, view),
  };
}
