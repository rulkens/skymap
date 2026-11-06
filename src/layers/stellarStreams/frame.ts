/**
 * stellarStreamsPlanner — keeps the render loop ticking while visible streams drift (the
 * scheduler sleeps on a still camera, which would freeze the flow), and holds the cold-load
 * gate only while the streams would show. A hidden or still Layer votes nothing.
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
        loading: fade > 0 && !loaded,
      };
    },
  };
}
