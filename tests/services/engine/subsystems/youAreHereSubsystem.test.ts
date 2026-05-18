import { describe, expect, it } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// A skeletal state with just the scheduler stub — the subsystem only
// touches state.subsystems.scheduler.requestRender when alpha is
// mid-transition.
function makeState(): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
      fades: { fadeTo: () => Promise.resolve() },
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

  it('reports awake: false even inside the alpha fade band', () => {
    // youAreHereAlpha is a pure function of camera distance — any change
    // is already driven by camera motion, which wakes the loop through
    // the tween/spaceMouse/pointer-event paths. Reporting `awake: true`
    // when alpha sits mid-band would pin the render-on-demand loop on
    // forever whenever the camera parks inside the fade window.
    const sub = createYouAreHereSubsystem();
    for (const r of [0.1, 0.3, 0.5, 0.8, 1.1, 1.5, 2.0]) {
      const out = sub.produceLabels(makeState(), makeCtx(r, 0, 0));
      expect(out.awake).toBe(false);
    }
  });

  it('has stable id "you-are-here"', () => {
    const sub = createYouAreHereSubsystem();
    expect(sub.id).toBe('you-are-here');
  });
});
