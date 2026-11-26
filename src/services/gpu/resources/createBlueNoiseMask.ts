/**
 * createBlueNoiseMask — creates the density march's jitter mask texture and fills it from the
 * committed `public/lut/blueNoise.bin` (baked by `tools/lut/buildBlueNoiseMask.ts`).
 *
 * A relative URL, like `loadEnvBrdfLut`: the mask rides the static shell, never the R2 catalog
 * manifest, so no `dataUrl` and no cloud loader. `ready` never rejects: every density commit
 * awaits it, and a zero mask (a visible step grid) beats a volume that is off for the session.
 */
import type { BlueNoiseMask } from '../../../@types/rendering/BlueNoiseMask';
import { BLUE_NOISE_MASK_SIZE, BLUE_NOISE_MASK_SLICES } from '../../../data/volume/blueNoiseMask';
import { HttpError } from '../../loading/fetchWithProgress';
import { defaultRetryPolicy } from '../../loading/retryPolicy';

const MASK_URL = '/lut/blueNoise.bin';

export function createBlueNoiseMask(device: GPUDevice): BlueNoiseMask {
  const size: [number, number] = [
    BLUE_NOISE_MASK_SIZE,
    BLUE_NOISE_MASK_SIZE * BLUE_NOISE_MASK_SLICES,
  ];
  const texture = device.createTexture({
    label: 'scalarVolume-jitter-mask',
    size,
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  let destroyed = false;

  async function fetchMask(): Promise<ArrayBuffer> {
    const response = await fetch(MASK_URL);
    if (!response.ok) throw new HttpError(response.status, MASK_URL);
    const bytes = await response.arrayBuffer();
    // A 200 can be the SPA fallback's HTML.
    if (bytes.byteLength !== size[0] * size[1]) {
      throw new Error(`${MASK_URL}: ${bytes.byteLength} bytes, expected ${size[0] * size[1]}`);
    }
    return bytes;
  }

  async function load(): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const bytes = await fetchMask();
        // A Layer torn down mid-fetch: writing a destroyed texture is a validation error.
        if (destroyed) return;
        device.queue.writeTexture({ texture }, bytes, { bytesPerRow: BLUE_NOISE_MASK_SIZE }, size);
        return;
      } catch (error) {
        if (destroyed) return;
        const decision = defaultRetryPolicy(attempt, error as Error);
        if (decision === 'give-up') {
          console.warn('[blueNoiseMask] drawing the volume unjittered:', error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
      }
    }
  }

  return {
    texture,
    ready: load(),
    destroy: () => {
      destroyed = true;
      texture.destroy();
    },
  };
}
