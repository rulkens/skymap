/**
 * ViewRig — the frame's view roster plus the scoped program it runs.
 * `renderFrame` walks `program`, expanding a `'once'` `FrameSection` against
 * the canvas view and a `'perView'` one against every entry of `views`.
 */

import type { EngineState } from '../state/EngineState';
import type { FrameSection } from './FrameSection';
import type { FrameView } from './FrameView';
import type { ViewSpec } from './ViewSpec';

export type ViewRig = {
  /** `null`/empty ⇒ the canvas view alone (mono; one derivation, one submit —
   *  see `renderFrame`'s view-identity batching). Otherwise `runFrame` derives
   *  each via `deriveView(canvas.snapshot, cam, spec)`, REPLACING the canvas
   *  view: a rig with no canvas draw (dome) lists none of its own. */
  readonly views: (canvas: FrameView, state: EngineState) => readonly ViewSpec[] | null;
  readonly program: readonly FrameSection[];
  /** Whether the canvas cursor maps to one of this rig's views — false turns
   *  off picking and the terrain pick marker (a dome has no single cursor ray). */
  readonly pickable: boolean;
};
