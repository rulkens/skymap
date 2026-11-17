/**
 * stellarStreamsPlanner — keeps the render loop ticking while visible streams drift (the
 * scheduler sleeps on a still camera, which would freeze the flow). A hidden or still Layer
 * votes nothing.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';
import { stellarStreamsLookLive } from './streaks/present/stellarStreamsLookLive';

export function stellarStreamsPlanner(
  runtime: StellarStreamsRuntime,
): Extract<FrameContentPlanner<void, 'stellarStreams'>, { scope: 'once' }> {
  return {
    name: 'stellar-streams',
    scope: 'once',
    fade: 'stellarStreams',
    hasDistanceBand: true,
    plan(_snapshot, _views, state, fade) {
      const { streak, haze } = state.settings.stellarStreams;
      return {
        value: undefined,
        // The passes' own gate: a look at intensity 0 draws nothing, so its flow cannot wake.
        awake:
          fade > 0 && [streak, haze].some((l) => stellarStreamsLookLive(runtime, l) && l.flow > 0),
        settling: false,
        // The asset row's `gates` holds the fade at 0 until the bin commits; a vote here could
        // only fire while a released bin fades out, forcing a wake.
        loading: false,
      };
    },
  };
}
