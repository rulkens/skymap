import { describe, expect, it } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import type { ReadyFrameContext } from '../../../../src/services/engine/frame/frameContext';
import type { EngineState } from '../../../../src/@types';

// A skeletal state with just the scheduler stub — the subsystem only
// touches state.subsystems.scheduler.requestRender when alpha is
// mid-transition.
function makeState(): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
    },
  } as unknown as EngineState;
}

function makeCtx(x: number, y: number, z: number): ReadyFrameContext {
  return { drawCamPos: [x, y, z] } as unknown as ReadyFrameContext;
}

describe('youAreHereSubsystem (producer form)', () => {
  it('returns empty output when camera is far from origin', () => {
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx(1000, 0, 0));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
    expect(out.awake).toBe(false);
  });

  it('returns one label and one line at the origin', () => {
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx(0, 0, 0));
    expect(out.labels).toHaveLength(1);
    expect(out.lines).toHaveLength(1);
    expect(out.labels[0]!.text).toBe('You are here');
  });

  it('exposes an "awake" flag during the alpha mid-transition', () => {
    const sub = createYouAreHereSubsystem();
    // A position inside the fade band — `youAreHereAlpha` should return
    // a value in (0, 1).  Exact distance depends on the fade band's
    // tuning; this test only asserts that SOME mid-transition position
    // exists.  If the helper returns only 0 or 1 across the band,
    // refine the input.
    let sawAwake = false;
    for (const r of [0.1, 0.3, 0.5, 0.8, 1.1, 1.5, 2.0]) {
      const out = sub.produceLabels(makeState(), makeCtx(r, 0, 0));
      if (out.awake) {
        sawAwake = true;
        break;
      }
    }
    expect(sawAwake).toBe(true);
  });

  it('has stable id "you-are-here"', () => {
    const sub = createYouAreHereSubsystem();
    expect(sub.id).toBe('you-are-here');
  });
});
