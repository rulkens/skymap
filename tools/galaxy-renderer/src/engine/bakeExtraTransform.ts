/**
 * bakeExtraTransform — a rigid (scale, spin, tilt, translate) transform
 * baked directly into an interleaved stride-8 buffer, extracted from
 * `galaxy-engine.js:186-195`'s `bakeTransform`.
 *
 * Background galaxies could instead be drawn with the same buffer as the
 * foreground subject plus a per-draw model-matrix uniform, mutated between
 * draw calls. That's the standing writeBuffer-vs-submit ordering trap:
 * interleaving `queue.writeBuffer` with `queue.submit` in the same frame
 * does not guarantee the writes land before the matching draw reads them,
 * so mutate-a-uniform-per-draw silently corrupts whichever background
 * galaxy draws first. Baking the transform once into each extra galaxy's
 * own vertex data sidesteps the race entirely: every instance carries its
 * final world-space position, so drawing it at any point in the frame (or
 * many times) reads the same correct bytes. The one-time bake cost is paid
 * once per `setExtras` call, not per frame, making background galaxies
 * free at draw time.
 *
 * The transform order matches the spike exactly — scale, then rotate about
 * Y (disk spin), then rotate about X (inclination tilt), then translate —
 * because it is not a general rotation composition a reader could safely
 * reorder: swapping the Y and X steps changes the tilt axis's orientation
 * relative to the already-spun disk, producing a visibly different galaxy.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** Interleaved record stride: 8 float32 slots per star or dust particle. */
const STRIDE = 8;

/**
 * Bake a scale + Y-rotation (spin) + X-rotation (tilt) + translation into
 * an interleaved stride-8 buffer, in place.
 *
 * @param data      Interleaved stride-8 records (star or dust layout);
 *                  mutated in place.
 * @param sizeIndex Offset of the size field within each record — 6 for
 *                  stars (x,y,z,r,g,b,size,brightness), 3 for dust
 *                  (x,y,z,size,r,g,b,opacity).
 * @param pos       World-space position to translate to, applied after
 *                  rotation.
 * @param scale     Uniform scale applied to position and size before
 *                  rotation.
 * @param rotY      Spin about the Y (disk) axis, in radians, applied
 *                  first.
 * @param tiltX     Inclination tilt about the X axis, in radians, applied
 *                  after the Y spin.
 */
export function bakeExtraTransform(
  data: Float32Array,
  sizeIndex: number,
  pos: Readonly<Vec3>,
  scale: number,
  rotY: number,
  tiltX: number,
): void {
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);

  for (let i = 0; i < data.length; i += STRIDE) {
    // Non-null: i walks the buffer in STRIDE steps from 0, so i, i+1, i+2
    // and i+sizeIndex are always in bounds for a well-formed stride-8 record.
    const x = data[i]! * scale;
    const y = data[i + 1]! * scale;
    const z = data[i + 2]! * scale;

    // Spin about the disk axis (Y).
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;

    // Inclination tilt (X), applied to the already-spun y/z1 pair.
    const y2 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;

    data[i] = x1 + pos[0];
    data[i + 1] = y2 + pos[1];
    data[i + 2] = z2 + pos[2];
    data[i + sizeIndex]! *= scale;
  }
}
