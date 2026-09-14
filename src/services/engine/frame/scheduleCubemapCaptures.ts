/**
 * scheduleCubemapCaptures — every `CUBEMAP_CAPTURES` row's faces for this
 * frame, in one map: the frame's single call, so `renderFrame` stays unaware of
 * how many kinds of capture there are.
 */

import type { CaptureFaceContexts } from '../../../@types/engine/frame/CaptureFaceContexts';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { scheduleSkyCaptures } from './scheduleSkyCaptures';

export function scheduleCubemapCaptures(input: {
  readonly state: EngineState;
  readonly ctx: ReadyFrameContext;
}): CaptureFaceContexts {
  return scheduleSkyCaptures(input);
}
