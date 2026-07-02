/**
 * createStarWriter — pure stride-8 interleaving into a pre-sized
 * Float32Array, extracted from galaxy-model.js:122-127's `starData` /
 * `writePos` pair. Each `write()` call appends one record in field order
 * x,y,z,r,g,b,size,brightness and advances the cursor by 8 floats.
 *
 * The spike let `writePos` walk past `starData.length` — a Float32Array
 * write beyond its bounds is a silent no-op in JS, so an under-sized
 * capacity formula corrupted the tail of the galaxy instead of failing.
 * This writer throws on overflow instead: a regression in the capacity
 * formula (owned by the orchestrator, not this file — see StarWriter.d.ts)
 * now shows up as a loud test failure, not a garbled render.
 *
 * `view()` returns a zero-copy `subarray` of just the filled region, since
 * the backing array is intentionally over-allocated (population counts are
 * `Math.floor`'d shares of a budget, so the sum can undershoot the
 * planned total) and the GPU only wants the bytes actually written.
 */
import type { StarWriter } from '../../@types/model/StarWriter';

const STRIDE = 8;

export function createStarWriter(capacityStars: number): StarWriter {
  const buffer = new Float32Array(capacityStars * STRIDE);
  let recordCount = 0;

  return {
    write(x, y, z, r, g, b, size, brightness) {
      if (recordCount >= capacityStars) {
        throw new Error(
          `StarWriter overflow: capacity ${capacityStars} exceeded on write ${recordCount + 1}`,
        );
      }
      const offset = recordCount * STRIDE;
      buffer[offset] = x;
      buffer[offset + 1] = y;
      buffer[offset + 2] = z;
      buffer[offset + 3] = r;
      buffer[offset + 4] = g;
      buffer[offset + 5] = b;
      buffer[offset + 6] = size;
      buffer[offset + 7] = brightness;
      recordCount++;
    },
    count: () => recordCount,
    view: () => buffer.subarray(0, recordCount * STRIDE),
  };
}
