/**
 * readDustMapChannelSum — debug-only: copies the WHOLE `dustMapTex` back to
 * the CPU and sums every rgba16float channel over every texel. One-shot,
 * own encoder/submit/buffer (no persistent readback state, unlike
 * `createIsmMapReadbacks.ts`'s streamed copies) — this exists purely so the
 * probe (`readback:placeDust`'s consuming-multiply assertion,
 * `probeGpuErrors.ts`) can observe `dustMap/fragment.wesl`'s ACTUAL rendered
 * output, not a buffer the compute kernel and the probe both read directly
 * (which would validate the reduction but never the fragment shader's own
 * consumption of it). No production caller: nothing in `drawFrame` needs a
 * scalar summary of the map it just wrote.
 *
 * The sum is linear in `dustRenorm[0]` by construction — every term
 * `dustMap/fragment.wesl` writes (`coeff`, hence `tail0..tail3`, hence
 * `slices` even through its `max(x, 0)` clamps, since those preserve sign
 * under a POSITIVE scalar multiply) scales exactly with that one uniform.
 * A `dust.tau`-only tuning change scales `totalMass` (hence `dustRenorm[0]`)
 * without touching which particles are placed or survive, so the probe can
 * predict the EXACT ratio this sum should move by — see `computePlaceDustBudget.ts`'s
 * `totalMass` doc.
 */
import { f16ToFloat } from '../../../../../src/utils/math/f16ToFloat';

const BYTES_PER_TEXEL = 8; // rgba16float: 4 lanes x 2 bytes
const COPY_BYTES_PER_ROW_ALIGNMENT = 256;

export async function readDustMapChannelSum(device: GPUDevice, texture: GPUTexture): Promise<number> {
  const { width, height } = texture;
  const unpaddedBytesPerRow = width * BYTES_PER_TEXEL;
  const bytesPerRow =
    Math.ceil(unpaddedBytesPerRow / COPY_BYTES_PER_ROW_ALIGNMENT) * COPY_BYTES_PER_ROW_ALIGNMENT;
  const buffer = device.createBuffer({
    label: 'galaxy:dustMapChannelSumReadback',
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const enc = device.createCommandEncoder({ label: 'galaxy:dustMapChannelSumReadback' });
  enc.copyTextureToBuffer({ texture }, { buffer, bytesPerRow, rowsPerImage: height }, { width, height });
  device.queue.submit([enc.finish()]);

  await buffer.mapAsync(GPUMapMode.READ);
  let sum = 0;
  try {
    const padded = new Uint16Array(buffer.getMappedRange());
    const rowStrideU16 = bytesPerRow / 2;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const base = row * rowStrideU16 + col * 4;
        sum +=
          f16ToFloat(padded[base]!) +
          f16ToFloat(padded[base + 1]!) +
          f16ToFloat(padded[base + 2]!) +
          f16ToFloat(padded[base + 3]!);
      }
    }
  } finally {
    buffer.unmap();
  }
  buffer.destroy();
  return sum;
}
