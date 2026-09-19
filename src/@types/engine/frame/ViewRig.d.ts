/**
 * ViewRig — the frame's view roster plus the scoped program it runs.
 * `renderFrame` walks `program`, expanding a `'once'` `FrameSection` against
 * the main context and a `'perView'` one against every entry of `views`.
 */

import type { EngineState } from '../state/EngineState';
import type { FrameSection } from './FrameSection';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type ViewRig = {
  /** The frame's views, derived from the main context; mono returns `[main]` itself. */
  readonly views: (main: ReadyFrameContext, state: EngineState) => readonly ReadyFrameContext[];
  readonly program: readonly FrameSection[];
};
