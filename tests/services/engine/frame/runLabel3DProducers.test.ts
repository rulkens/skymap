/**
 * runLabel3DProducers — pins the walk to `state.label3DProducers` (the
 * composed list `createLayers` builds), not `LABEL_3D_PRODUCERS`, the
 * core-only constant. Without this, a Layer's world producer could land on
 * state and never actually run.
 */
import { describe, it, expect, vi } from 'vitest';
import { runLabel3DProducers } from '../../../../src/services/engine/frame/runLabel3DProducers';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

describe('runLabel3DProducers', () => {
  it('walks state.label3DProducers, not the core constant', () => {
    const setLabels = vi.fn();
    const stubLabel = { id: 'stub-label' };
    const state = {
      label3DProducers: [
        {
          id: 'stub-producer',
          produceLabels3D: () => ({ labels: [stubLabel], awake: true }),
        },
      ],
      gpu: { label3DRenderer: { setLabels } },
    } as unknown as EngineState;

    const awake = runLabel3DProducers(state, {} as ReadyFrameContext);

    expect(setLabels).toHaveBeenCalledWith([stubLabel]);
    expect(awake).toBe(true);
  });
});
