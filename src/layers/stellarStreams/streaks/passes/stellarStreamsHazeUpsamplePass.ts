/**
 * stellarStreamsHazeUpsamplePass — additive HDR composite of the half-res haze, on the hdr NEAR0
 * line just before `stellar-streams` (so after the Milky Way's dust multiply, like the streaks).
 * Gates on the producer's own predicate, so it never blits an offscreen nobody wrote.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { StellarStreamsRuntime } from '../../@types/StellarStreamsRuntime';
import { createUpsamplePass } from '../../../../services/engine/frame/passes/createUpsamplePass';
import { stellarStreamsLookLive } from '../present/stellarStreamsLookLive';

export function stellarStreamsHazeUpsamplePass(
  runtime: StellarStreamsRuntime,
): ContentPass<'stellarStreams'> {
  return createUpsamplePass<'stellarStreams'>({
    name: 'stellar-streams-haze-upsample',
    sourceTargetId: 'stellar-streams-haze',
    fade: 'stellarStreams',
    handleOf: () => runtime.hazeUpsample,
    enabled: (state) => stellarStreamsLookLive(runtime, state.settings.stellarStreams.haze),
  });
}
