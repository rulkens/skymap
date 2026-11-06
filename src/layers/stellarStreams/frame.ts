/**
 * stellarStreamsPlanner — keeps the render loop ticking while visible streams drift (the
 * scheduler sleeps on a still camera, which would freeze the flow). A hidden or still Layer
 * votes nothing.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

export function stellarStreamsPlanner(
  runtime: StellarStreamsRuntime,
): Extract<FrameContentPlanner<void, 'stellarStreams'>, { scope: 'once' }> {
  return {
    name: 'stellar-streams',
    scope: 'once',
    fade: 'stellarStreams',
    hasDistanceBand: true,
    plan(_snapshot, _views, state, fade) {
      const loaded = runtime.renderer.hasData();
      const { streak, haze } = state.settings.stellarStreams;
      return {
        value: undefined,
        awake: fade > 0 && loaded && (streak.flow > 0 || haze.flow > 0),
        settling: false,
        // The asset row's `gates` holds the fade at 0 until the bin commits; a vote here could
        // only fire while a released bin fades out, forcing a wake.
        loading: false,
      };
    },
  };
}
