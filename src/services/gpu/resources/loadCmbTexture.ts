import { CMB_TEXTURE_URL } from '../../../data/rendering/cmbTextureUrl';

/**
 * loadCmbTexture — the CMB map as an `rgba8unorm` texture. Decoded through a
 * 2D canvas and uploaded with `writeTexture` rather than
 * `copyExternalImageToTexture`, which software WebGPU (SwiftShader) rejects.
 * The texels are linear intensities: the shell adds them into HDR as light.
 */
export async function loadCmbTexture(device: GPUDevice): Promise<GPUTexture> {
  const response = await fetch(CMB_TEXTURE_URL);
  if (!response.ok) throw new Error(`failed to fetch ${CMB_TEXTURE_URL}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx2d = canvas.getContext('2d')!;
  ctx2d.drawImage(bitmap, 0, 0);
  bitmap.close();
  const texels = ctx2d.getImageData(0, 0, width, height).data;
  const texture = device.createTexture({
    label: 'cmb-map',
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture }, texels, { bytesPerRow: width * 4 }, [width, height]);
  return texture;
}
