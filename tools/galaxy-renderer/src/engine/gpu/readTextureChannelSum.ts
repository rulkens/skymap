/**
 * readTextureChannelSum — debug-only: copies a WHOLE rgba16float texture
 * back to the CPU and sums every channel over every texel. Texture-agnostic
 * (no dust- or field-specific logic) — two callers as of Task 15/its fix
 * round: `dustMapTex` (`requestDustMapChannelSum`, the original caller —
 * `readback:placeDust`'s consuming-multiply assertion observes
 * `dustMap/fragment.wesl`'s ACTUAL rendered output, not a buffer the compute
 * kernel and the probe both read directly, which would validate the
 * reduction but never the fragment shader's own consumption of it) and
 * `fieldTex` (`requestFieldTexChannelSum`/`requestArmCloudRenderedFluxSum`/
 * `requestArmSpurCloudRenderedFluxSum`, `readback:placeArmCloud`'s/
 * `readback:placeArmSpurCloud`'s own consuming-multiply checks, same
 * reasoning against `fieldSplat/fragment.wesl`). One-shot, own encoder/
 * submit/buffer (no persistent readback state, unlike
 * `createIsmMapReadbacks.ts`'s streamed copies). No production caller:
 * nothing in `drawFrame` needs a scalar summary of a target it just wrote.
 *
 * The sum is linear in whatever consume-time scale the calling pass reads
 * (`dustRenorm[0]`, `armCloudRenorm[0]`/`spurCloudRenorm[0]`) by
 * construction — see each caller's own site for the specific tuning knob
 * that isolates its scale and the exact ratio it predicts.
 */
import { f16ToFloat } from '../../../../../src/utils/math/f16ToFloat';

const BYTES_PER_TEXEL = 8; // rgba16float: 4 lanes x 2 bytes
const COPY_BYTES_PER_ROW_ALIGNMENT = 256;

export async function readTextureChannelSum(device: GPUDevice, texture: GPUTexture): Promise<number> {
  const { width, height } = texture;
  const unpaddedBytesPerRow = width * BYTES_PER_TEXEL;
  const bytesPerRow =
    Math.ceil(unpaddedBytesPerRow / COPY_BYTES_PER_ROW_ALIGNMENT) * COPY_BYTES_PER_ROW_ALIGNMENT;
  const buffer = device.createBuffer({
    label: 'galaxy:textureChannelSumReadback',
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const enc = device.createCommandEncoder({ label: 'galaxy:textureChannelSumReadback' });
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
