/**
 * createBlueNoiseMask — creates the density march's jitter mask texture and fills it from the
 * committed `public/lut/blueNoise.bin` (baked by `tools/lut/buildBlueNoiseMask.ts`).
 *
 * A relative URL, like `loadEnvBrdfLut`: the mask rides the static shell, never the R2 catalog
 * manifest, so no `dataUrl` and no cloud loader.
 */
import type { BlueNoiseMask } from '../../../@types/rendering/BlueNoiseMask';
import { BLUE_NOISE_MASK_SIZE, BLUE_NOISE_MASK_SLICES } from '../../../data/volume/blueNoiseMask';

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
  const ready = fetch(MASK_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`failed to fetch ${MASK_URL}: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => {
      device.queue.writeTexture({ texture }, bytes, { bytesPerRow: BLUE_NOISE_MASK_SIZE }, size);
    });
  // The density slots' commits report a failure; with the volume off nobody awaits it, and an
  // unawaited rejection would surface as an uncaught error.
  ready.catch(() => undefined);
  return { texture, ready };
}
