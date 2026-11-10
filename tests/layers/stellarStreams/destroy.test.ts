import { describe, it, expect, vi } from 'vitest';

import { destroy } from '../../../src/layers/stellarStreams/destroy';
import type { StellarStreamsRuntime } from '../../../src/layers/stellarStreams/@types/StellarStreamsRuntime';

describe('stellarStreams destroy', () => {
  it('cancels the meta slot too, so a late meta never uploads ribbons after their buffer is gone', () => {
    const metaSlot = { cancel: vi.fn() };
    const released = { destroy: () => {}, cancel: () => {} };
    const runtime = {
      slot: released,
      metaSlot,
      renderer: released,
      ribbonPick: released,
      hazeUpsample: released,
    };

    destroy(runtime as unknown as StellarStreamsRuntime);
    expect(metaSlot.cancel).toHaveBeenCalled();
  });
});
