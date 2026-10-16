/**
 * runLabel3DProducers — pins the walk to `state.label3DProducers`, the list
 * `createLayers` composes from Layers' world producers. Without this, a
 * Layer's world producer could land on state and never actually run.
 */
import { describe, it, expect, vi } from 'vitest';
import { runLabel3DProducers } from '../../../../src/services/engine/frame/runLabel3DProducers';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import { STRONG_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';

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

    const awake = runLabel3DProducers(state, {} as FrameView);

    expect(setLabels).toHaveBeenCalledWith([stubLabel]);
    expect(awake).toBe(true);
  });

  it("a world label recedes by its producer's entry", () => {
    const setLabels = vi.fn();
    const state = {
      label3DProducers: [
        {
          id: 'receding',
          label: 'fixture',
          produceLabels3D: () => ({ labels: [{ id: 'w', fadeAlpha: 0.5 }], awake: false }),
        },
      ],
      visibilityEntries: [{ label: 'fixture', cluster: 'fixture', recession: 'strong' }],
      gpu: { label3DRenderer: { setLabels } },
    } as unknown as EngineState;
    const ctx = { snapshot: { focusBlend: 1, focusPickId: null } } as unknown as FrameView;

    runLabel3DProducers(state, ctx);

    expect(setLabels.mock.calls[0]![0][0].fadeAlpha).toBeCloseTo(0.5 * STRONG_RECESSION);
  });
});
