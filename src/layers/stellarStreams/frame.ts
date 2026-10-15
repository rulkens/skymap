/**
 * stellarStreamsPlanner — keeps the render loop ticking while the streams
 * drift; without it the scheduler sleeps on a still camera and the flow freezes.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { StellarStreamsRuntime } from './@types/StellarStreamsRuntime';

export function stellarStreamsPlanner(
  runtime: StellarStreamsRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  return {
    name: 'stellar-streams',
    scope: 'once',
    plan: () => ({ value: undefined, awake: runtime.renderer.hasData(), settling: false }),
  };
}
