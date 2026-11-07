/**
 * packAntiquePlateBodies — up to ANTIQUE_PLATE_BODY_CAPACITY records, in the
 * order given (the caller ranks them), into the `PlateBodies` uniform that
 * `shaders/antiqueLook/plateBodies.wesl` declares; that struct is the byte map.
 */

import type { AntiquePlateBody } from '../../../@types/rendering/AntiquePlateBody';
import {
  ANTIQUE_PLATE_BODIES_BYTES,
  ANTIQUE_BODY_PRINT_CODES,
  ANTIQUE_PLATE_BODY_CAPACITY,
} from '../../../data/rendering/antiquePlateBodies';

const HEADER_FLOATS = 4;
const RECORD_FLOATS = 16;

export function packAntiquePlateBodies(
  bodies: readonly AntiquePlateBody[],
  out: ArrayBuffer = new ArrayBuffer(ANTIQUE_PLATE_BODIES_BYTES),
): ArrayBuffer {
  const f32 = new Float32Array(out);
  const count = Math.min(bodies.length, ANTIQUE_PLATE_BODY_CAPACITY);
  // Stale records past `count` are never read; zeroing keeps captures legible.
  f32.fill(0);
  new Uint32Array(out)[0] = count;
  for (let i = 0; i < count; i++) {
    const { centre, radiusUnits, sun, print, ring } = bodies[i]!;
    const at = HEADER_FLOATS + i * RECORD_FLOATS;
    f32.set(centre, at);
    f32[at + 3] = radiusUnits;
    f32.set(sun, at + 4);
    f32[at + 7] = ANTIQUE_BODY_PRINT_CODES[print];
    if (ring !== null) {
      f32.set(ring.normal, at + 8);
      // Outer edge 0 is the shader's "no ring".
      f32[at + 11] = ring.outer;
      f32.set(ring.lines, at + 12);
    }
  }
  return out;
}
