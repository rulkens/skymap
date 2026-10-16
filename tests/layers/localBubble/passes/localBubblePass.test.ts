import { describe, expect, it, vi } from 'vitest';

import { localBubblePass } from '../../../../src/layers/localBubble/passes/localBubblePass';
import { STRONG_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { LocalBubbleRuntime } from '../../../../src/layers/localBubble/@types/LocalBubbleRuntime';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';

// Inside the shell's distance window (full from 1 to 4 kpc), so only the value moves.
const VIEW = {
  vp: new Float32Array(16),
  camPos: [2 * SCALE_UNITS.KPC_TO_MPC, 0, 0],
} as unknown as SlabView;
const STATE = { settings: { localBubble: { intensity: 1 } } } as unknown as EngineState;

function opacityAt(focusBlend: number): number {
  const draw = vi.fn();
  const runtime = { renderer: { hasMesh: () => true, draw } } as unknown as LocalBubbleRuntime;
  const ctx = { snapshot: { focusBlend, focusPickId: null } } as unknown as FrameView;
  localBubblePass(runtime).draw({} as GPURenderPassEncoder, VIEW, ctx, STATE, 1);
  // Args: (pass, vp, camPos, opacity).
  return draw.mock.calls[0]![3] as number;
}

describe('localBubblePass draw', () => {
  it('draws at the handed value times its recession', () => {
    expect(opacityAt(0)).toBeGreaterThan(0);
    expect(opacityAt(1)).toBeCloseTo(opacityAt(0) * STRONG_RECESSION);
  });
});
