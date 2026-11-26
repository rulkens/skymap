/**
 * createJitterMaskSlot — the march's blue-noise jitter mask (`public/lut/blueNoise.bin`, baked by
 * `tools/lut/buildBlueNoiseMask.ts`), written into the r8unorm texture the renderer already binds.
 * A relative URL, like `loadEnvBrdfLut`: the mask rides the static shell, not the R2 manifest.
 */

import type { AssetSlot } from '../../../../@types/loading/AssetSlot';
import { createAssetSlot } from '../../../../services/loading/AssetSlot';
import { fetchWithProgress } from '../../../../../packages/shared/src/services/loading/fetchWithProgress';

const MASK_URL = '/lut/blueNoise.bin';

export function createJitterMaskSlot(
  device: GPUDevice,
  texture: GPUTexture,
): AssetSlot<ArrayBuffer, void> {
  const { width, height } = texture;
  return createAssetSlot<ArrayBuffer, void>({
    name: 'jitter-mask',
    fetch: async (_req, signal, onProgress) => {
      const bytes = await fetchWithProgress(MASK_URL, signal, onProgress);
      // A 200 can be the SPA fallback's HTML.
      if (bytes.byteLength !== width * height) {
        throw new Error(`${MASK_URL}: ${bytes.byteLength} bytes, expected ${width * height}`);
      }
      return bytes;
    },
    commit: async (bytes) => {
      device.queue.writeTexture({ texture }, bytes, { bytesPerRow: width }, [width, height]);
    },
  });
}
