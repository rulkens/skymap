/**
 * baseTracksOf — compiled base segments split per channel, each sorted by start.
 * `compileClip` emits this and `resolveSeqJoins` reads frame legs off it, so the
 * evaluator and rule 4 see the same order (`buildFrameLegs` breaks ties by it).
 */
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { Channel } from '../../../@types/animation/Channel';

const ALL_CHANNELS: readonly Channel[] = ['distance', 'yaw', 'pitch', 'roll', 'target', 'fov'];

export function baseTracksOf(segs: readonly BaseSegment[]): Record<Channel, BaseSegment[]> {
  return Object.fromEntries(
    ALL_CHANNELS.map((ch) => [
      ch,
      segs.filter((s) => s.channel === ch).sort((a, b) => a.startSec - b.startSec),
    ]),
  ) as Record<Channel, BaseSegment[]>;
}
