/**
 * baseTracksOf — compiled base segments split per channel, each in `byStartSec`
 * order. `compileClip` emits this and `resolveSeqJoins` reads frame legs off it,
 * so the evaluator and rule 4 see the same order (`buildFrameLegs` breaks ties by
 * it). Channels follow `CHANNEL_SPACE`'s key order, the order compileClip has
 * always used.
 */
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { Channel } from '../../../@types/animation/Channel';
import { CHANNEL_SPACE } from './channelSpace';
import { byStartSec } from '../../../utils/animation/byStartSec';

export function baseTracksOf(segs: readonly BaseSegment[]): Record<Channel, BaseSegment[]> {
  return Object.fromEntries(
    (Object.keys(CHANNEL_SPACE) as Channel[]).map((ch) => [
      ch,
      segs.filter((s) => s.channel === ch).sort(byStartSec),
    ]),
  ) as Record<Channel, BaseSegment[]>;
}
