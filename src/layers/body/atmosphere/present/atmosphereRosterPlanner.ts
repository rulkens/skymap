/**
 * atmosphereRosterPlanner — the bodies `drawsAtmosphere` holds for in at least one rig
 * view: the once `sky-view` bake's roster. Every per-view shell and aerial draw gates
 * on that same predicate, so the roster is exactly their union and no rig view samples
 * a table this frame did not bake. A dome face looks where the canvas does not, hence
 * every view, never the canvas alone. The host whose atmosphere encloses the eye
 * passes every view's frustum gate, so its sky bakes whatever the look direction.
 */

import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { PositionedId } from '../../../../@types/scene/PositionedId';
import { ATMOSPHERE_BODIES } from '../data/atmosphereBodies';
import { drawsAtmosphere } from './drawsAtmosphere';

export const atmosphereRosterPlanner: Extract<
  FrameContentPlanner<ReadonlySet<PositionedId>>,
  { scope: 'once' }
> = {
  name: 'atmosphere-roster',
  scope: 'once',
  plan(_snapshot, views, state) {
    const bodyIds = new Set<PositionedId>(
      ATMOSPHERE_BODIES.filter((body) =>
        views.some((view) => drawsAtmosphere(body.id, view, state)),
      ).map((body) => body.id),
    );
    return { value: bodyIds, awake: false, settling: false, loading: false };
  },
};
