/**
 * createVelocityField — Factory that loads the CF4++ field asset onto the GPU.
 *
 * Fetches the `.json` metadata sidecar + the `.bin` blob, uploads the latter
 * as an n³ `rgba16float` 3D texture (rgb = velocity km/s, a = overdensity δ),
 * builds a shared linear sampler, and returns the `VelocityField` handle the
 * engine shares with every layer. The shape is pinned in
 * `@types/field/VelocityField.d.ts`.
 *
 * The blob is C-order `[z][y][x][c]` float16 RGBA, so `writeTexture` walks it
 * with `bytesPerRow = n * 4 channels * 2 bytes` and `rowsPerImage = n` — the
 * x-fastest / z-outer layout the extractor (`data/convertCf4ppVfield.py`)
 * packs. The JSON keys (`n`, `boxMpcPerH`, `speedKmsMax`, `speedKmsP99`,
 * `deltaMax`, `deltaP99`) come straight from that same script and map 1:1 onto
 * `VelocityFieldMeta`.
 *
 * Spike provenance: `tools/spike/public/index.html` lines ~116-131 (meta fetch,
 * texture creation, writeTexture, sampler).
 */
import type { VelocityField } from '../../@types/field/VelocityField';
import type { VelocityFieldMeta } from '../../@types/field/VelocityFieldMeta';

export async function createVelocityField(
  device: GPUDevice,
  binUrl: string,
  jsonUrl: string,
): Promise<VelocityField> {
  const json = (await (await fetch(jsonUrl)).json()) as {
    n: number;
    boxMpcPerH: number;
    speedKmsMax: number;
    speedKmsP99: number;
    deltaMax: number;
    deltaP99: number;
  };
  const raw = await (await fetch(binUrl)).arrayBuffer();

  const n = json.n;
  const texture = device.createTexture({
    size: [n, n, n],
    dimension: '3d',
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // bytesPerRow = n voxels * 4 channels * 2 bytes (float16); rowsPerImage = n.
  device.queue.writeTexture({ texture }, raw, { bytesPerRow: n * 4 * 2, rowsPerImage: n }, [
    n,
    n,
    n,
  ]);

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  const meta: VelocityFieldMeta = {
    n: json.n,
    boxMpcPerH: json.boxMpcPerH,
    speedKmsMax: json.speedKmsMax,
    speedKmsP99: json.speedKmsP99,
    deltaMax: json.deltaMax,
    deltaP99: json.deltaP99,
  };

  return {
    textureView: texture.createView(),
    sampler,
    meta,
    dispose: () => texture.destroy(),
  };
}
