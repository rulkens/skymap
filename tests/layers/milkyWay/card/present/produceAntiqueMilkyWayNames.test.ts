import { describe, it, expect } from 'vitest';
import { produceAntiqueMilkyWayNames } from '../../../../../src/layers/milkyWay/card/present/produceAntiqueMilkyWayNames';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import { GAL_X_EQ, GAL_Z_EQ } from '../../../../../src/data/orientation/orientationFrames';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// 1600 px across a 50° field: the shot tool's default lens.
const PX_PER_RAD = 1600 / (2 * Math.tan((25 * Math.PI) / 180));
const names = produceAntiqueMilkyWayNames(37);
// The handed band value is the gate only; the producer never reads it.
const produce = (s: EngineState, c: FrameView) => names(s, c, 1);

const state = (enabled: boolean) =>
  ({ settings: { antique: { enabled } }, viewRig: 'mono' }) as unknown as EngineState;

/** The eye `kpc` from the Galactic Centre, `elevationDeg` above the disc on the anticentre side. */
function ctxAt(kpc: number, elevationDeg: number): FrameView {
  const e = (elevationDeg * Math.PI) / 180;
  const d = kpc / 1000;
  const cam: Vec3 = [0, 1, 2].map(
    (i) =>
      MILKY_WAY_CENTER_WORLD[i]! + d * (-Math.cos(e) * GAL_X_EQ[i]! + Math.sin(e) * GAL_Z_EQ[i]!),
  ) as Vec3;
  return { drawCamPos: cam, drawPxPerRad: PX_PER_RAD } as unknown as FrameView;
}

describe('produceAntiqueMilkyWayNames', () => {
  it('names nothing with the look off', () => {
    expect(produce(state(false), ctxAt(32, 90)).labels).toEqual([]);
  });

  it('names the arms of a disc seen face-on from outside, the Sun among them', () => {
    const { labels } = produce(state(true), ctxAt(32, 90));
    expect(labels.map((l) => l.id)).toContain('mwName-sun');
    for (const l of labels) expect(l.fadeAlpha).toBeCloseTo(1);
  });

  it('drops the names edge-on, where the arms stack into one band', () => {
    expect(produce(state(true), ctxAt(40, 3)).labels).toEqual([]);
  });

  it('drops the names from inside the disc and from too far to letter it', () => {
    expect(produce(state(true), ctxAt(9, 60)).labels).toEqual([]);
    expect(produce(state(true), ctxAt(150, 90)).labels).toEqual([]);
  });

  it('sets Sol hic within a kiloparsec of the Sun, the world origin', () => {
    const sun = produce(state(true), ctxAt(32, 90)).labels.find((l) => l.id === 'mwName-sun')!;
    expect(Math.hypot(...sun.worldPos) * 1000).toBeLessThan(1.1);
  });
});
