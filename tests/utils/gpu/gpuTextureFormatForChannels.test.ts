import { describe, it, expect } from 'vitest';
import { gpuTextureFormatForChannels } from '../../../src/utils/gpu/gpuTextureFormatForChannels';

describe('gpuTextureFormatForChannels', () => {
  it('maps 1→r16float and 4→rgba16float', () => {
    expect(gpuTextureFormatForChannels(1)).toBe('r16float');
    expect(gpuTextureFormatForChannels(4)).toBe('rgba16float');
  });

  it('throws on an out-of-contract channel count', () => {
    // The helper is the single source of truth, so a bad channel count
    // must fail loudly here, not downstream.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => gpuTextureFormatForChannels(2 as any)).toThrow(/channel/i);
  });
});
