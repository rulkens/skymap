import type { GridBox } from '../../@types/GridBox';
import type { GridElement } from '../../@types/GridElement';
import type { TraceReadback } from '../../@types/TraceReadback';
import { BYTES_PER_ELEMENT } from './createGridBuffers';

/**
 * readbackTrace — copies the harness's trace grid to a MAP_READ staging
 * buffer and returns a CPU-side snapshot for the T16/T17 export legs.
 *
 * The staging buffer is COPY_DST | MAP_READ only — never bound in a shader —
 * so `maxStorageBufferBindingSize` (the limit that also gates the trace
 * buffer's own STORAGE usage) does not apply to it; only `maxBufferSize`
 * does. Refuse BEFORE allocating, reusing the same voxels × BYTES_PER_ELEMENT
 * arithmetic `planGridBudget` uses, in its by-name message style.
 */
export async function readbackTrace(
  device: GPUDevice,
  traceBuffer: GPUBuffer,
  box: GridBox,
  element: GridElement,
): Promise<TraceReadback> {
  const voxels = box.dims[0] * box.dims[1] * box.dims[2];
  const requestedBytes = voxels * BYTES_PER_ELEMENT[element];
  const limitBytes = device.limits.maxBufferSize;
  if (requestedBytes > limitBytes) {
    throw new Error(
      `readbackTrace: trace needs ${requestedBytes} bytes for its MAP_READ staging copy, ` +
        `over this device's ${limitBytes}-byte limit.`,
    );
  }

  const staging = device.createBuffer({
    label: 'mcpm-trace-readback',
    size: requestedBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // try/finally, per pickProgram.ts's own mapAsync readback: anything that
  // throws after createBuffer (a validation error from copy/submit, or a
  // device-lost mapAsync rejection) must still reach destroy(), or the
  // staging buffer's GPU memory leaks until GC. unmap() only runs once
  // mapAsync has actually resolved — calling it unmapped is the bug this
  // guards against, not a fallback path.
  try {
    const encoder = device.createCommandEncoder({ label: 'mcpm-trace-readback' });
    encoder.copyBufferToBuffer(traceBuffer, 0, staging, 0, requestedBytes);
    device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const Ctor = element === 'f16' ? Uint16Array : Float32Array;
    let data: Uint16Array | Float32Array;
    try {
      // .slice() copies out of the mapped range into its own buffer — the
      // range itself detaches on unmap/destroy below.
      data = new Ctor(staging.getMappedRange()).slice();
    } finally {
      staging.unmap();
    }
    return { data, element, dims: box.dims };
  } finally {
    staging.destroy();
  }
}
