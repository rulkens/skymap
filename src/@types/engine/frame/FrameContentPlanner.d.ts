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
 *
 * A planner declaring `fade` (required once `K` is narrowed) gets that entry's handed value as `plan`'s last argument
 * and is never skipped: the passes reading its output run their own gate.
 */

import type { FrameView } from './FrameView';
import type { PassState } from './PassState';
import type { PlannerResult } from './PlannerResult';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { FadeParam } from '../../animation/FadeParam';
import type { ShowKey } from '../../animation/ShowKey';

export type FrameContentPlanner<T, K extends ShowKey = ShowKey> = (
  | {
      readonly name: string;
      readonly scope: 'once';
      plan(
        snapshot: ReadyFrameContext,
        views: readonly FrameView[],
        state: PassState,
        ...fade: FadeParam<K, ShowKey>
      ): PlannerResult<T>;
    }
  | {
      readonly name: string;
      readonly scope: 'perView';
      plan(view: FrameView, state: PassState, ...fade: FadeParam<K, ShowKey>): PlannerResult<T>;
    }
) &
  ([ShowKey] extends [K] ? { readonly fade?: K } : { readonly fade: K });
