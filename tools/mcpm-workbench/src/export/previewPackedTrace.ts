import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';
import { f16ToFloat } from '../../../../src/utils/math/f16ToFloat';
import { packLogTraceVoxels } from '../../../../src/utils/volume/packLogTraceVoxels';

export type PreviewPackedTrace = {
  readonly buffer: GPUBuffer;
  readonly element: GridElement;
};

/**
 * previewPackedTrace — packs `values` through the REAL `packLogTraceVoxels`
 * (the same call `exportScfd.ts`'s `.scfd` leg makes) and uploads the result
 * as a STORAGE buffer a second TracePass can march in place of the live
 * trace (spec §7's preview-export view). `packLogTraceVoxels` always packs
 * to f16 bits; this widens to f32 CPU-side ONLY when the device lacks
 * `shader-f16` — the same fork `createMcpmHarness` takes for the live grid's
 * own element, so the preview never risks an `enable f16` compile failure on
 * an adapter the live trace itself would have fallen back to f32 on.
 */
export function previewPackedTrace(
  device: GPUDevice,
  values: Float32Array,
  box: GridBox,
): PreviewPackedTrace {
  const { voxels } = packLogTraceVoxels(values, box.dims);
  const element: GridElement = device.features.has('shader-f16') ? 'f16' : 'f32';
  const data = element === 'f16' ? voxels : Float32Array.from(voxels, f16ToFloat);

  const buffer = device.createBuffer({
    label: 'mcpm-preview-packed-trace',
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return { buffer, element };
}
