/**
 * ViewRig — the frame's view roster plus the scoped program it runs.
 * `renderFrame` walks `program`, expanding a `'once'` `FrameSection` against
 * the canvas view and a `'perView'` one against every entry of `views`.
 */

import type { EngineState } from '../state/EngineState';
import type { FrameSection } from './FrameSection';
import type { FrameView } from './FrameView';

export type ViewRig = {
  /** The frame's views, derived off its canvas view; mono returns `[canvas]` itself. */
  readonly views: (canvas: FrameView, state: EngineState) => readonly FrameView[];
  readonly program: readonly FrameSection[];
};
