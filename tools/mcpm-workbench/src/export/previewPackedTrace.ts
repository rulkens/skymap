import type { GridBox } from '../../@types/grid/GridBox';
import type { GridElement } from '../../@types/grid/GridElement';
import { f16ToFloat } from '../../../../src/utils/math/f16ToFloat';
import { packLogTraceVoxels } from '../../../../src/utils/volume/packLogTraceVoxels';
import type { PreviewPackedTrace } from '../../@types/export/PreviewPackedTrace';

/**
 * previewPackedTrace — packs `values` through the REAL `packLogTraceVoxels`
 * (the same call `exportScfd.ts`'s `.scfd` leg makes) and uploads the result
 * as a STORAGE buffer a second TracePass can march in place of the live
 * trace. `packLogTraceVoxels` always packs
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
  // `values` is a `readbackTrace()` widening — already grid.wesl's X-fastest
  // layout, not numpy C-order — see exportScfd.ts's identical call.
  const { voxels } = packLogTraceVoxels(values, box.dims, 'x-fastest');
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
