/**
 * trackBody — the legs must land on the body where the clock will put it: a
 * leg read at the wrong instant (or on the wrong side of a hold) leaves the
 * body drifting out of frame while the clock runs.
 */

import { describe, it, expect } from 'vitest';
import { trackBody } from '../../../../../src/data/animation/clips/makers/trackBody';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

const JD = 2_461_000;
const KEYS = [
  { sec: 0, simDays: JD },
  { sec: 1, simDays: JD },
  { sec: 3, simDays: JD + 0.2 },
];

const PHOBOS = asSceneBodyId('phobos');
const MARS = asSceneBodyId('mars');

type Leg = { kind: string; to: number[]; over: number };

describe('trackBody', () => {
  it('ends each leg on the body at the instant the clock reads then, holds included', () => {
    const track = trackBody(PHOBOS, KEYS, 0.5) as { kind: 'seq'; children: Leg[] };
    expect(track.children).toHaveLength(6);

    const atHold = deriveBodyStates(JD).get(PHOBOS)!.positionMpc;
    expect(track.children[1]!.to).toEqual([...atHold]); // 1 s: still the held instant

    const atEnd = deriveBodyStates(JD + 0.2).get(PHOBOS)!.positionMpc;
    expect(track.children[5]!.to).toEqual([...atEnd]);
  });

  it('pairs each leg with an aim at the second body in chase mode', () => {
    const track = trackBody(PHOBOS, KEYS, 1, { bodyId: MARS, elevationRad: 0 }) as {
      kind: 'seq';
      children: { kind: string; children: { kind: string }[] }[];
    };
    expect(track.children.every((leg) => leg.kind === 'all' && leg.children.length === 2)).toBe(
      true,
    );
  });
});
