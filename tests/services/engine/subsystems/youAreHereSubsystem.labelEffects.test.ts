/**
 * youAreHereSubsystem · labelStyleOverride integration
 *
 * Exercises the override path through the real producer: when the
 * DebugPanel's LabelEffectsSection picks 'youAreHere' as the target
 * category, the produced label adopts the override's outline fields;
 * when it picks another category, the label falls back to the
 * producer's baked drop-shadow outline (OUTLINE_COLOR + OUTLINE_EM_FRAC
 * in `youAreHereSubsystem.ts`).
 *
 * State stub: the producer only touches state.subsystems.fades.fadeTo
 * (one-shot layer fade-in).  A no-op stub suffices.
 *
 * Context stub: youAreHereAlpha is a pure function of |drawCamPos|, so
 * we place the camera at the origin — the alpha is comfortably above 0
 * and the produceLabels body reaches the single labels.push.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createYouAreHereSubsystem } from '../../../../src/services/engine/subsystems/youAreHereSubsystem';
import {
  clearLabelStyleOverride,
  setLabelStyleOverride,
} from '../../../../src/services/engine/labelStyleOverride';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function makeState(): EngineState {
  return {
    subsystems: {
      scheduler: { requestRender: () => {} },
      fades: { fadeTo: () => Promise.resolve() },
    },
  } as unknown as EngineState;
}

function makeCtx(): ReadyFrameContext {
  return { drawCamPos: [0, 0, 0] } as unknown as ReadyFrameContext;
}

describe('youAreHereSubsystem · labelStyleOverride', () => {
  beforeEach(() => {
    clearLabelStyleOverride();
  });

  it('applies the override when targetCategory is youAreHere', () => {
    setLabelStyleOverride({
      targetCategory: 'youAreHere',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.08,
    });
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.outlineColor).toEqual([1, 0, 0, 1]);
    expect(label.outlineEmFrac).toBe(0.08);
  });

  it('falls back to the baked drop-shadow outline when override targets another category', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.08,
    });
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    // Producer defaults: a soft black drop-shadow outline.
    expect(label.outlineColor).toEqual([0, 0, 0, 0.1]);
    expect(label.outlineEmFrac).toBe(0.16);
  });
});
