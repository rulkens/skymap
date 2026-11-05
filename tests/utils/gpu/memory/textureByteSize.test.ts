/**
 * textureByteSize — hand-computed byte totals for the cases the mip walk has
 * to get right: plain 2D, a mip chain, a 3D texture (depth halves per mip),
 * a 2D array (layers do NOT halve), sampleCount, and the unknown-format
 * fallback + once-per-format warning.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { textureByteSize } from '../../../../src/utils/gpu/memory/textureByteSize';

const baseDescriptor = {
  usage: 0,
} as const;

describe('textureByteSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sizes a single-mip 2D texture: width × height × bytesPerTexel', () => {
    const bytes = textureByteSize({
      ...baseDescriptor,
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
    } as GPUTextureDescriptor);
    expect(bytes).toBe(4 * 4 * 4); // 64
  });

  it('sums a mip chain, each level halving width/height', () => {
    // 8×8 (256 B) + 4×4 (64 B) = 320 B.
    const bytes = textureByteSize({
      ...baseDescriptor,
      size: { width: 8, height: 8 },
      format: 'rgba8unorm',
      mipLevelCount: 2,
    } as GPUTextureDescriptor);
    expect(bytes).toBe(320);
  });

  it('halves depth per mip for a 3D texture (floor, min 1)', () => {
    // 8×8×4×1 (256) + 4×4×2×1 (32) + 2×2×1×1 (4) = 292 B.
    const bytes = textureByteSize({
      ...baseDescriptor,
      size: { width: 8, height: 8, depthOrArrayLayers: 4 },
      format: 'r8unorm',
      dimension: '3d',
      mipLevelCount: 3,
    } as GPUTextureDescriptor);
    expect(bytes).toBe(292);
  });

  it('does NOT halve depthOrArrayLayers for a 2D array texture', () => {
    // 8×8×4×1 (256) + 4×4×4×1 (64) = 320 B — the layer count stays 4 at mip 1.
    const bytes = textureByteSize({
      ...baseDescriptor,
      size: { width: 8, height: 8, depthOrArrayLayers: 4 },
      format: 'r8unorm',
      mipLevelCount: 2,
    } as GPUTextureDescriptor);
    expect(bytes).toBe(320);
  });

  it('multiplies the whole sum by sampleCount', () => {
    const bytes = textureByteSize({
      ...baseDescriptor,
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
      sampleCount: 4,
    } as GPUTextureDescriptor);
    expect(bytes).toBe(4 * 4 * 4 * 4); // 256
  });

  it('falls back to 4 bytes/texel for an unknown format and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const descriptor = {
      ...baseDescriptor,
      size: { width: 2, height: 2 },
      format: 'some-future-format' as GPUTextureFormat,
    } as GPUTextureDescriptor;

    expect(textureByteSize(descriptor)).toBe(2 * 2 * 4);
    expect(textureByteSize(descriptor)).toBe(2 * 2 * 4);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
