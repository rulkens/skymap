/**
 * Binds one trail group's show key to core's fade resolution. `PassState` carries no
 * `visibilityEntries`, so the pass could not resolve a per-group fade itself; `state` is the
 * engine's own, read on each call.
 */

import type { GatedOrbitTrailGroup } from '../../../@types/engine/frame/GatedOrbitTrailGroup';
import type { OrbitTrailGroup } from '../../../@types/engine/layer/OrbitTrailGroup';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { resolveVisibilityOpacity } from '../presentation/resolveVisibilityOpacity';

export function gateOrbitTrailGroup(
  group: OrbitTrailGroup,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): GatedOrbitTrailGroup {
  return {
    ...group,
    fade: (snapshot) => resolveVisibilityOpacity(state, snapshot, group.show),
  };
}
