import { describe, expect, it } from 'vitest';
import { fork, hold, oscillate } from '../../../../../src/services/engine/animation/effectHelpers';
import { evaluateClip } from '../../../../../src/services/engine/camera/clips/evaluateClip';
import { buildTimeline } from '../../../src/timeline/utils/buildTimeline';
import { compileTimeline } from '../../../src/timeline/utils/compileTimeline';
import { oscWaveAt } from '../../../src/timeline/utils/oscWaveAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';

const AMP = 0.05;

/** The bob starts 3 s in, so a perpetual (absolute-phase) and a windowed (local-phase) bob differ. */
const expectMatchesEvaluator = (osc: Effect) => {
  const withBob: ClipData = { timeline: [hold(3), fork(osc), hold(10)] };
  const without: ClipData = { timeline: [hold(3), hold(10)] };
  const { rows } = buildTimeline(withBob, compileTimeline(withBob, 'equatorial'), []);
  const row = rows.find((r) => r.id === 'e:1.0')!;
  for (let t = row.startSec!; t < row.tailEndSec!; t += 0.37) {
    const bob = evaluateClip(withBob, t).pitch - evaluateClip(without, t).pitch;
    expect(oscWaveAt(row.wave!, t)).toBeCloseTo(bob / AMP, 6);
  }
};

describe('oscWaveAt', () => {
  it("follows a perpetual bob's period and absolute phase", () => {
    expectMatchesEvaluator(oscillate('pitch', { amp: AMP, period: 5 }));
  });

  it("follows a windowed bob's period and window-local phase", () => {
    expectMatchesEvaluator(oscillate('pitch', { amp: AMP, period: 2.5, over: 6 }));
  });
});
