import type { HistogramReadback } from '../../@types/HistogramReadback';
import { HISTOGRAM_BINS } from './createGridBuffers';

// histogram.wesl's `histogramCounts` buffer: HISTOGRAM_BINS fork bins/max-marker, plus one
// more element (index HISTOGRAM_BINS) holding this project's in-grid sampled-point counter.
const HISTOGRAM_COUNTS_ELEMENTS = HISTOGRAM_BINS + 1;
const HISTOGRAM_COUNTS_BYTES = HISTOGRAM_COUNTS_ELEMENTS * 4;

/**
 * readbackHistogram — copies the histogram pass's counts+sampled-counter (72 B) and the
 * first `nDataPoints` densities into one MAP_READ staging buffer, in that
 * order, and returns typed-array snapshots. Mirrors `readbackTrace`'s
 * try/finally destroy discipline: anything that throws after `createBuffer`
 * must still reach `.destroy()`, or the staging buffer's GPU memory leaks
 * until GC.
 */
export async function readbackHistogram(
  device: GPUDevice,
  histogramBuffer: GPUBuffer,
  densitiesBuffer: GPUBuffer,
  nDataPoints: number,
): Promise<HistogramReadback> {
  const densitiesBytes = nDataPoints * 4;
  const staging = device.createBuffer({
    label: 'mcpm-histogram-readback',
    size: HISTOGRAM_COUNTS_BYTES + densitiesBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  try {
    const encoder = device.createCommandEncoder({ label: 'mcpm-histogram-readback' });
    encoder.copyBufferToBuffer(histogramBuffer, 0, staging, 0, HISTOGRAM_COUNTS_BYTES);
    encoder.copyBufferToBuffer(densitiesBuffer, 0, staging, HISTOGRAM_COUNTS_BYTES, densitiesBytes);
    device.queue.submit([encoder.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    let counts: Uint32Array;
    let sampledCount: number;
    let densities: Float32Array;
    try {
      // .slice() copies out of the mapped range into its own buffer — the range
      // itself detaches on unmap/destroy below.
      const mapped = staging.getMappedRange();
      const rawCounts = new Uint32Array(mapped, 0, HISTOGRAM_COUNTS_ELEMENTS);
      counts = rawCounts.slice(0, HISTOGRAM_BINS);
      sampledCount = rawCounts[HISTOGRAM_BINS]!;
      densities = new Float32Array(mapped, HISTOGRAM_COUNTS_BYTES, nDataPoints).slice();
    } finally {
      staging.unmap();
    }
    return { counts, sampledCount, densities };
  } finally {
    staging.destroy();
  }
}
