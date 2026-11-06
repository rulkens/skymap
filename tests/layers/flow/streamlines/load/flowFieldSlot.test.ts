/** flowFieldSlot — release frees the renderer's velocity texture. */

import { describe, expect, it, vi } from 'vitest';

import { createFlowFieldSlot } from '../../../../../src/layers/flow/streamlines/load/flowFieldSlot';
import type { FlowFieldRenderer } from '../../../../../src/layers/flow/streamlines/@types/FlowFieldRenderer';

vi.mock('../../../../../src/layers/flow/streamlines/load/flowFieldFetcher', () => ({
  flowFieldFetcher: async () => ({ dims: [1, 1, 1] }),
}));

describe('createFlowFieldSlot', () => {
  it('release() clears the renderer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const renderer = { upload: vi.fn(), clear: vi.fn() } as unknown as FlowFieldRenderer;
    const slot = createFlowFieldSlot(renderer);

    void slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(renderer.clear).toHaveBeenCalledTimes(1);
  });
});
