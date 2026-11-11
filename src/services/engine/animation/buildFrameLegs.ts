/**
 * buildFrameLegs — where a compiled clip's frame legs open: one per change of
 * reference frame among its tweens. The evaluator converts a leg's start once,
 * and `resolveSeqJoins` refuses a blend across one (rule 4), so both read this
 * one definition. `snapLegs` pins each zero-length tween to the leg it snaps.
 */
import type { Channel } from '../../../@types/animation/Channel';
import { sameFrame } from '../camera/arms/sameFrame';
import type { BaseSegment } from '../../../@types/animation/compiledClip/BaseSegment';
import type { FrameLeg } from '../../../@types/animation/compiledClip/FrameLeg';

function runsOn(seg: BaseSegment): number {
  return seg.endSec > seg.startSec ? 1 : 0;
}

export function buildFrameLegs(baseTracks: Record<Channel, BaseSegment[]>): {
  readonly legs: readonly FrameLeg[];
  readonly snapLegs: ReadonlyMap<BaseSegment, number>;
} {
  // `'tween'` only: reading a relative `spin`'s absent tag as `'absolute'` sent
  // an earth-framed pose back through the Mpc seam mid-orbit.
  // The lens is frame-free (`fovYRadAt`): its untagged tween must not open an absolute leg.
  const segments = Object.entries(baseTracks)
    .flatMap(([ch, track]) => (ch === 'fov' ? [] : track))
    .filter((seg) => seg.segKind === 'tween')
    // At a shared instant a zero-length snap sorts first, so the leg that runs
    // on from it owns the instant; track order would hide one leg forever.
    .sort((a, b) => a.startSec - b.startSec || runsOn(a) - runsOn(b));
  const legs: FrameLeg[] = [{ frame: 'absolute', startSec: -Infinity, anchor: null }];
  const snapLegs = new Map<BaseSegment, number>();
  for (const seg of segments) {
    const frame = seg.frame ?? 'absolute';
    if (!sameFrame(frame, legs[legs.length - 1]!.frame)) {
      legs.push({ frame, startSec: seg.startSec, anchor: seg });
    }
    if (runsOn(seg) === 0) snapLegs.set(seg, legs.length - 1);
  }
  return { legs, snapLegs };
}
