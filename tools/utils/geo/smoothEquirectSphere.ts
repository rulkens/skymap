/**
 * smoothEquirectSphere — angular median-then-mean smoothing of an
 * equirectangular scalar map; longitude kernel widened by 1/cos(b) to stay
 * circular on the sphere. Median BEFORE mean is the whole point: it picks a
 * side before averaging can invent a radius in the cavity between two walls.
 */

const RAD = Math.PI / 180;
const MIN_COS_B = 1e-3;
/**
 * Cap on longitude taps per kernel. Near the pole the 1/cos(b) widening runs to
 * a full half-turn, and the top rows then cost more than the rest of the map
 * combined. Striding keeps the angular FOOTPRINT and samples it sparsely, which
 * a median and a mean both tolerate — an exact pole row is a handful of texels
 * covering a vanishing solid angle.
 */
const MAX_X_TAPS = 65;

export function smoothEquirectSphere(
  plane: Float32Array,
  widthPx: number,
  heightPx: number,
  radiusDeg: number,
): Float32Array {
  const median = pass(plane, widthPx, heightPx, radiusDeg, true);
  return pass(median, widthPx, heightPx, radiusDeg, false);
}

function pass(
  src: Float32Array,
  widthPx: number,
  heightPx: number,
  radiusDeg: number,
  takeMedian: boolean,
): Float32Array {
  const out = new Float32Array(src.length);
  const degPerPxY = 180 / heightPx;
  const degPerPxX = 360 / widthPx;
  const ry = Math.max(1, Math.round(radiusDeg / degPerPxY));
  const gathered: number[] = [];

  for (let y = 0; y < heightPx; y++) {
    const b = 90 - ((y + 0.5) / heightPx) * 180;
    // Capped at a half-turn: near the pole the widened kernel legitimately spans
    // every longitude, and past that the wrap just resamples the same texels.
    const rx = Math.min(
      widthPx >> 1,
      Math.max(1, Math.round(radiusDeg / degPerPxX / Math.max(Math.cos(b * RAD), MIN_COS_B))),
    );
    for (let x = 0; x < widthPx; x++) {
      gathered.length = 0;
      const strideX = Math.max(1, Math.ceil((2 * rx + 1) / MAX_X_TAPS));
      for (let dy = -ry; dy <= ry; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= heightPx) continue;
        for (let dx = -rx; dx <= rx; dx += strideX) {
          const sx = (((x + dx) % widthPx) + widthPx) % widthPx;
          const v = src[sy * widthPx + sx]!;
          // Upstream leaves a handful of failed sight lines as NaN; they must not
          // poison a neighbourhood, and dropping them lets the kernel heal the hole.
          if (Number.isFinite(v)) gathered.push(v);
        }
      }
      if (gathered.length === 0) {
        out[y * widthPx + x] = NaN;
        continue;
      }
      if (takeMedian) {
        gathered.sort((p, q) => p - q);
        out[y * widthPx + x] = gathered[gathered.length >> 1]!;
      } else {
        let sum = 0;
        for (const v of gathered) sum += v;
        out[y * widthPx + x] = sum / gathered.length;
      }
    }
  }
  return out;
}
