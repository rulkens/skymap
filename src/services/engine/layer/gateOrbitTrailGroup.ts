/**
 * Binds one trail group's show key to core's fade resolution, per view so the entry's
 * distance bands apply. `PassState` carries no `visibilityEntries`, so the pass could not
 * resolve a per-group fade itself; `state` is the engine's own, read on each call.
 */

import type { GatedOrbitTrailGroup } from '../../../@types/engine/frame/GatedOrbitTrailGroup';
import type { OrbitTrailGroup } from '../../../@types/engine/layer/OrbitTrailGroup';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveVisibilityOpacity } from '../presentation/resolveVisibilityOpacity';
import { viewBandOf } from '../presentation/viewBandOf';

export function gateOrbitTrailGroup(
  group: OrbitTrailGroup,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): GatedOrbitTrailGroup {
  return {
    ...group,
    // A trail group's show entry has no items, so its handed value is one number:
    // `resolveViewFadeValue`'s scalar branch, written out because `ShowKey` is not
    // narrowed here.
    fade: (view) =>
      resolveVisibilityOpacity(state, view.snapshot, group.show) *
      viewBandOf(state.visibilityEntries, group.show, undefined, view),
  };
}
