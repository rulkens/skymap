/**
 * resampleSkyToEquirect — nearest-neighbour resample of scattered all-sky
 * samples onto an equirectangular grid, in whatever spherical frame the
 * caller's angles are in.
 *
 * Written for HEALPix tables that ship their own (l, b) per row: reading the
 * angles off the table sidesteps knowing whether the file is RING- or
 * NESTED-ordered, which nothing in the header states and guessing wrong
 * scrambles the sky silently rather than loudly.
 *
 * Nearest-neighbour, not bilinear: the inputs are a piecewise-constant
 * tessellation already, and interpolating across a pixel boundary would invent
 * intermediate radii the underlying fit never produced.
 */

const BUCKET_DEG = 1;
const L_BUCKETS = 360 / BUCKET_DEG;
const B_BUCKETS = 180 / BUCKET_DEG;
/** Give up past this search radius — with ~19 samples/deg² nothing legitimate is this isolated. */
const MAX_SEARCH_DEG = 12;
/** Floor on cos(b) when widening the longitude sweep, so the pole rows stay finite. */
const MIN_COS_B = 1e-3;
const RAD = Math.PI / 180;

export function resampleSkyToEquirect(
  lDeg: Float64Array,
  bDeg: Float64Array,
  channels: readonly Float64Array[],
  widthPx: number,
  heightPx: number,
): Float32Array[] {
  const sampleCount = lDeg.length;
  if (bDeg.length !== sampleCount) {
    throw new Error(
      `resampleSkyToEquirect: l/b length mismatch (${sampleCount} vs ${bDeg.length})`,
    );
  }
  for (const channel of channels) {
    if (channel.length !== sampleCount) {
      throw new Error(
        `resampleSkyToEquirect: channel length ${channel.length} does not match ${sampleCount} samples`,
      );
    }
  }

  // Unit vectors once: the inner loop compares dot products, and recomputing
  // three trig calls per candidate per pixel dominated everything else.
  const sx = new Float64Array(sampleCount);
  const sy = new Float64Array(sampleCount);
  const sz = new Float64Array(sampleCount);
  const buckets: number[][] = Array.from({ length: L_BUCKETS * B_BUCKETS }, () => []);
  for (let i = 0; i < sampleCount; i++) {
    const l = lDeg[i]! * RAD;
    const b = bDeg[i]! * RAD;
    const cosB = Math.cos(b);
    sx[i] = Math.cos(l) * cosB;
    sy[i] = Math.sin(l) * cosB;
    sz[i] = Math.sin(b);
    const lb = wrapLBucket(Math.floor(lDeg[i]! / BUCKET_DEG));
    const bb = clampBBucket(Math.floor((bDeg[i]! + 90) / BUCKET_DEG));
    buckets[bb * L_BUCKETS + lb]!.push(i);
  }

  const out = channels.map(() => new Float32Array(widthPx * heightPx));
  for (let y = 0; y < heightPx; y++) {
    const b = 90 - ((y + 0.5) / heightPx) * 180;
    const cosB = Math.cos(b * RAD);
    const bRad = b * RAD;
    for (let x = 0; x < widthPx; x++) {
      const l = ((x + 0.5) / widthPx) * 360;
      const lRad = l * RAD;
      const px = Math.cos(lRad) * Math.cos(bRad);
      const py = Math.sin(lRad) * Math.cos(bRad);
      const pz = Math.sin(bRad);

      const nearest = findNearest(px, py, pz, l, b, cosB, buckets, sx, sy, sz);
      const dst = y * widthPx + x;
      for (let c = 0; c < channels.length; c++) {
        out[c]![dst] = channels[c]![nearest]!;
      }
    }
  }
  return out;
}

function wrapLBucket(bucket: number): number {
  return ((bucket % L_BUCKETS) + L_BUCKETS) % L_BUCKETS;
}

function clampBBucket(bucket: number): number {
  return Math.min(B_BUCKETS - 1, Math.max(0, bucket));
}

/**
 * Widen the ring outward a degree at a time until it holds a candidate, then
 * search ONE more ring: a bucket's corner sits further away than its centre,
 * so the first ring to produce a hit can still hide a nearer sample next door.
 */
function findNearest(
  px: number,
  py: number,
  pz: number,
  lDeg: number,
  bDeg: number,
  cosB: number,
  buckets: readonly (readonly number[])[],
  sx: Float64Array,
  sy: Float64Array,
  sz: Float64Array,
): number {
  let best = -1;
  let bestDot = -Infinity;
  let ringsAfterHit = 0;
  for (let r = 0; r <= MAX_SEARCH_DEG; r++) {
    // Longitude buckets subtend cos(b) of their nominal angle, so a pole row
    // must sweep proportionally more of them to cover the same arc.
    const lSpan = Math.ceil(r / Math.max(cosB, MIN_COS_B));
    for (let db = -r; db <= r; db++) {
      const bb = Math.floor((bDeg + 90) / BUCKET_DEG) + db;
      if (bb < 0 || bb >= B_BUCKETS) continue;
      for (let dl = -lSpan; dl <= lSpan; dl++) {
        // Interior cells were covered by an earlier ring; only the rim is new.
        if (r > 0 && Math.abs(db) !== r && Math.abs(dl) !== lSpan) continue;
        const lb = wrapLBucket(Math.floor(lDeg / BUCKET_DEG) + dl);
        for (const i of buckets[bb * L_BUCKETS + lb]!) {
          const dot = px * sx[i]! + py * sy[i]! + pz * sz[i]!;
          if (dot > bestDot) {
            bestDot = dot;
            best = i;
          }
        }
      }
    }
    if (best >= 0) {
      if (ringsAfterHit >= 1) return best;
      ringsAfterHit++;
    }
  }
  if (best < 0) {
    throw new Error(
      `resampleSkyToEquirect: no sample within ${MAX_SEARCH_DEG}° of (l=${lDeg.toFixed(2)}, b=${bDeg.toFixed(2)})`,
    );
  }
  return best;
}
