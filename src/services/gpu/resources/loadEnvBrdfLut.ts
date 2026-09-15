/**
 * loadEnvBrdfLut — fetches the committed split-sum environment BRDF
 * (`public/lut/envBrdf.{json,bin}`, baked by `tools/lut/buildEnvBrdfLut.ts`)
 * and uploads it as the texture the mesh-body shader samples at
 * (NoV, roughness).
 *
 * A relative URL, like the MSDF font atlases: the LUT rides the static shell
 * (Vite `public/` in dev, Workers Assets in prod), never the R2 catalog
 * manifest — so no `dataUrl` indirection and no cloud loader.
 */

// Mirrors what `buildEnvBrdfLut` writes beside the .bin; `tools/` types are
// not importable from `src/`.
type EnvBrdfLutMeta = {
  readonly width: number;
  readonly height: number;
  readonly format: 'rg16float';
};

const LUT_BASE = '/lut';

const BYTES_PER_TEXEL = 4;

async function fetchLutAsset(file: string): Promise<Response> {
  const response = await fetch(`${LUT_BASE}/${file}`);
  if (!response.ok) throw new Error(`failed to fetch ${file}: ${response.status}`);
  return response;
}

export async function loadEnvBrdfLut(device: GPUDevice): Promise<GPUTexture> {
  const [meta, texels] = await Promise.all([
    fetchLutAsset('envBrdf.json').then((r) => r.json() as Promise<EnvBrdfLutMeta>),
    fetchLutAsset('envBrdf.bin').then((r) => r.arrayBuffer()),
  ]);

  const texture = device.createTexture({
    label: 'envBrdf-lut',
    size: [meta.width, meta.height],
    format: meta.format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // The 256-byte `bytesPerRow` alignment binds copyBufferToTexture, not this.
  device.queue.writeTexture({ texture }, texels, { bytesPerRow: meta.width * BYTES_PER_TEXEL }, [
    meta.width,
    meta.height,
  ]);
  return texture;
}
