/**
 * atmosphereRosterPlanner — the bodies holding a `body-m` slab in at least one rig
 * view: `atmosphereDrawList`'s roster. The sky-view bake runs once, off the canvas
 * view, while the shell draws per view on that view's own slab row, so the bake
 * must cover every view's rows (a dome face looks where the canvas does not).
 * A view's slabs already pass its frustum gate, which never drops the body whose
 * atmosphere encloses the eye, so the host's sky bakes whatever the look direction.
 */

import type { FrameContentPlanner } from '../../../../@types/engine/frame/FrameContentPlanner';
import type { PositionedId } from '../../../../@types/scene/PositionedId';

export const atmosphereRosterPlanner: Extract<
  FrameContentPlanner<ReadonlySet<PositionedId>>,
  { scope: 'once' }
> = {
  name: 'atmosphere-roster',
  scope: 'once',
  plan(_snapshot, views) {
    const hostIds = new Set<PositionedId>();
    for (const view of views) {
      for (const slab of view.slabs) {
        if (slab.frame.kind === 'body-m') hostIds.add(slab.frame.hostId);
      }
    }
    return { value: hostIds, awake: false, settling: false, loading: false };
  },
};
