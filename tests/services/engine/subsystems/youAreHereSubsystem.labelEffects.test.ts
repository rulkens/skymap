/**
 * youAreHereSubsystem · labelStyleOverride integration
 *
 * Exercises the override path through the real producer: when the
 * DebugPanel's LabelEffectsSection picks 'youAreHere' as the target
 * category, the produced label adopts the override's outline + glow
 * fields; when it picks any other category, the label's effect fields
 * stay undefined (producer defaults).
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
      glowColor: [0, 1, 0, 0.5],
      glowEmFrac: 0.2,
    });
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.outlineColor).toEqual([1, 0, 0, 1]);
    expect(label.outlineEmFrac).toBe(0.08);
    expect(label.glowColor).toEqual([0, 1, 0, 0.5]);
    expect(label.glowEmFrac).toBe(0.2);
  });

  it('ignores the override when targetCategory is a different category', () => {
    setLabelStyleOverride({
      targetCategory: 'cluster',
      outlineColor: [1, 0, 0, 1],
      outlineEmFrac: 0.08,
      glowColor: [0, 1, 0, 0.5],
      glowEmFrac: 0.2,
    });
    const sub = createYouAreHereSubsystem();
    const out = sub.produceLabels(makeState(), makeCtx());
    expect(out.labels).toHaveLength(1);
    const label = out.labels[0]!;
    expect(label.outlineColor).toBeUndefined();
    expect(label.outlineEmFrac).toBeUndefined();
    expect(label.glowColor).toBeUndefined();
    expect(label.glowEmFrac).toBeUndefined();
  });
});
