/**
 * createLensingUniformBuffer — allocate the single engine-owned
 * gravitational-lensing uniform (buffer + bind group). One lens set is
 * active per frame, so one instance lives on `state.gpu.lensingUniform`;
 * `renderFrame` writes it once per frame and every lensing-aware pipeline
 * (points, the pick pass, and — a later phase — the volume raymarch) binds
 * its bind group.
 *
 * ## Why this is the only place that wires the lensing buffer
 *
 * The 272-byte block (enabled + count + mode + scaleRadius + a `vec4` per
 * lens) is packed by `packLensingUniforms`, the single source of truth for
 * the layout. This factory owns only the GPU-resource lifecycle (alloc the
 * buffer at `LENSING_UNIFORM_BYTES`, build the bind group against the shared
 * BGL, upload via the packer). Keeping pack + alloc split mirrors the
 * focus-uniform pair (`packPointUniforms` / `createFocusUniformBuffer`):
 * the packer stays testable without a device, the factory stays trivial.
 *
 * Unlike the old layout — where the lens data rode in the tail of the points
 * `Uniforms` buffer — the buffer here is independent, so a second pipeline
 * can bind the same bytes without re-packing them.
 */

import type { LensingUniformsBgl } from '../../../@types/rendering/LensingUniformsBgl';
import type { LensingUniformsValue } from '../../../@types/rendering/LensingUniformsValue';
import type { LensingUniformBuffer } from '../../../@types/rendering/LensingUniformBuffer';
import {
  LENSING_UNIFORM_BYTES,
  packLensingUniforms,
} from '../../../utils/gpu/packLensingUniforms';

export function createLensingUniformBuffer(
  device: GPUDevice,
  lensingBgl: LensingUniformsBgl,
  label = 'lensing',
): LensingUniformBuffer {
  const buffer = device.createBuffer({
    label: `${label}-lensing-uniform`,
    size: LENSING_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    label: `${label}-lensing-bg`,
    layout: lensingBgl,
    entries: [{ binding: 0, resource: { buffer } }],
  });

  function write(value: LensingUniformsValue): void {
    device.queue.writeBuffer(buffer, 0, packLensingUniforms(value));
  }

  return {
    bindGroup,
    write,
    destroy(): void {
      buffer.destroy();
    },
  };
}
