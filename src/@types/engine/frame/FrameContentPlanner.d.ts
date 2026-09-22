/**
 * FrameContentPlanner — a CPU step in the frame program that prepares the data
 * a later GPU pass consumes: `structureMarkersPlanner` decides which marker
 * rings a view draws and returns their descriptors; `galaxyCatalogPlanner`
 * walks the disk LOD. Runs before any encoder opens, from a `{ kind: 'plan' }`
 * line in a section's program. `scope: 'once'` plans once for the whole frame
 * with every view in hand; `'perView'` plans once per view (a dome face, a VR
 * eye) so what a view consumes was planned for it. The result lands in the
 * frame's `FramePlannerResultStore`; a pass reads it back through
 * `snapshot.plans.get(planner, view)`.
 */

import type { FrameView } from './FrameView';
import type { PassState } from './PassState';
import type { PlannerResult } from './PlannerResult';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type FrameContentPlanner<T> =
  | {
      readonly name: string;
      readonly scope: 'once';
      plan(
        snapshot: ReadyFrameContext,
        views: readonly FrameView[],
        state: PassState,
      ): PlannerResult<T>;
    }
  | {
      readonly name: string;
      readonly scope: 'perView';
      plan(view: FrameView, state: PassState): PlannerResult<T>;
    };
