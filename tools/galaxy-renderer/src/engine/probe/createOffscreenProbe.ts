/**
 * createOffscreenProbe — the two headless readback paths: `sample`, the smoke
 * check "did anything render at all", and `grab`, the RGBA image the
 * descriptor matcher scores against reference photographs. Both re-render
 * the current camera and run the SAME `encodePost` the on-screen frame does,
 * so a live grade trailer is in the image either scores. Owns its three
 * persistent allocations outright; the engine's ownership ledger must not
 * also hold them.
 */
import { alignedBytesPerRow } from '../../../../../src/utils/gpu/alignedBytesPerRow';

import { sampleLuminanceStats } from './sampleLuminanceStats';
import { swizzleToRgba } from './swizzleToRgba';

/**
 * Edge of `sample`'s readback. 64 * 4 bytes is exactly the 256-byte row
 * alignment, so the readback carries no row padding — which is what lets
 * `sampleLuminanceStats` walk the buffer as one flat texel run.
 */
const SAMPLE_SIZE = 64;

/** Default edge of a `grab`, matching the matcher's own descriptor resolution. */
const DEFAULT_GRAB_SIZE = 480;

export type OffscreenProbe = {
  sample(): Promise<{ mean: number; max: number; litPct: number; stars: number }>;
  grab(size?: number): Promise<{ S: number; data: Uint8ClampedArray }>;
  destroy(): void;
};

export function createOffscreenProbe(deps: {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly drawFrame: (now: number) => void;
  /**
   * MUST be called with timed=false — an offscreen pass that consumes a timing
   * slot overwrites the on-screen composite's ticks.
   */
  readonly encodePost: (
    enc: GPUCommandEncoder,
    dst: GPUTextureView,
    scratch: GPUTextureView,
    timed: boolean,
  ) => void;
  readonly starCount: () => number;
}): OffscreenProbe {
  const { device, format, drawFrame, encodePost, starCount } = deps;

  const sampleTex = device.createTexture({
    label: 'galaxy:debugTex',
    size: [SAMPLE_SIZE, SAMPLE_SIZE],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  // The LDR intermediate `encodePost`'s grade trailer reads; untouched (but
  // harmless) at the identity grade settings that are the default.
  const sampleScratchTex = device.createTexture({
    label: 'galaxy:debugScratchTex',
    size: [SAMPLE_SIZE, SAMPLE_SIZE],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const sampleBuf = device.createBuffer({
    label: 'galaxy:debugBuf',
    size: SAMPLE_SIZE * 256,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  return {
    async sample() {
      drawFrame(performance.now());
      const enc = device.createCommandEncoder({ label: 'galaxy:samplePass' });
      encodePost(enc, sampleTex.createView(), sampleScratchTex.createView(), false);
      enc.copyTextureToBuffer(
        { texture: sampleTex },
        { buffer: sampleBuf, bytesPerRow: 256, rowsPerImage: SAMPLE_SIZE },
        [SAMPLE_SIZE, SAMPLE_SIZE, 1],
      );
      device.queue.submit([enc.finish()]);
      await sampleBuf.mapAsync(GPUMapMode.READ);
      const texels = new Uint8Array(sampleBuf.getMappedRange().slice(0));
      sampleBuf.unmap();
      return { ...sampleLuminanceStats(texels), stars: starCount() };
    },

    async grab(size?: number) {
      const S = size ?? DEFAULT_GRAB_SIZE;
      drawFrame(performance.now());
      const tex = device.createTexture({
        label: 'galaxy:grabTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      // The shared compositor samples NEAREST (correct for its own job — its
      // source and dst are always the same size), so a grab into a smaller S
      // point-samples the full-res scene rather than filtering it. The
      // descriptor is a coarse radial/azimuthal summary and the previous
      // bilinear tap was barely less aliased at these ratios; if auto-fit ever
      // gets noisy, a mip-chain downscale before the readback is the fix, not a
      // second sampler in the shared pass.
      const scratch = device.createTexture({
        label: 'galaxy:grabScratchTex',
        size: [S, S],
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const bpr = alignedBytesPerRow(S * 4);
      const buf = device.createBuffer({
        label: 'galaxy:grabBuf',
        size: bpr * S,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const enc = device.createCommandEncoder({ label: 'galaxy:grabPass' });
      encodePost(enc, tex.createView(), scratch.createView(), false);
      enc.copyTextureToBuffer(
        { texture: tex },
        { buffer: buf, bytesPerRow: bpr, rowsPerImage: S },
        [S, S, 1],
      );
      device.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = swizzleToRgba(src, bpr, S, format.startsWith('bgra'));
      buf.unmap();
      buf.destroy();
      tex.destroy();
      scratch.destroy();
      return { S, data: out };
    },

    destroy(): void {
      sampleTex.destroy();
      sampleScratchTex.destroy();
      sampleBuf.destroy();
    },
  };
}
