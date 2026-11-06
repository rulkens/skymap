/** filamentSlot — release frees the renderer's instance buffer. */

import { describe, expect, it, vi } from 'vitest';

import { createFilamentSlot } from '../../../../../src/layers/cosmicWebFilaments/filaments/load/filamentSlot';
import type { FilamentRenderer } from '../../../../../src/layers/cosmicWebFilaments/filaments/@types/FilamentRenderer';

vi.mock('../../../../../src/layers/cosmicWebFilaments/filaments/load/filamentFetcher', () => ({
  filamentFetcher: async () => ({}),
}));

describe('createFilamentSlot', () => {
  it('release() clears the renderer', async () => {
    const renderer = { upload: vi.fn(), clear: vi.fn() } as unknown as FilamentRenderer;
    const slot = createFilamentSlot(renderer);

    void slot.load({ small: false });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.release();

    expect(renderer.clear).toHaveBeenCalledTimes(1);
  });
});
