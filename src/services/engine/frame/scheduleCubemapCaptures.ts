/**
 * scheduleCubemapCaptures — every `CUBEMAP_CAPTURES` row's faces for this
 * frame, in one map: the frame's single call, so `renderFrame` stays unaware of
 * how many kinds of capture there are. Sky rows first: a probe's faces sample
 * the solar-system sky, and the sky scheduler is what reconciles that row's
 * texture into existence on its band edge.
 */

import type { CaptureFace } from '../../../@types/engine/frame/CaptureFace';
import type { CaptureFaceContexts } from '../../../@types/engine/frame/CaptureFaceContexts';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { scheduleProbeCapture } from './scheduleProbeCapture';
import { scheduleSkyCaptures } from './scheduleSkyCaptures';

export function scheduleCubemapCaptures(input: {
  readonly state: EngineState;
  readonly ctx: FrameView;
}): CaptureFaceContexts {
  const scheduled = new Map<CubemapCaptureKey, ReadonlyMap<CubeFace, CaptureFace>>(
    scheduleSkyCaptures(input),
  );
  const probe = scheduleProbeCapture(input);
  if (probe !== null) scheduled.set('probe', probe);
  return scheduled;
}
