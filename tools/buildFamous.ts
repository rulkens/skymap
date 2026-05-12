#!/usr/bin/env node
/**
 * buildFamous — assemble the curated `Famous` source layer.
 *
 * Reads:
 *   - `data/famous_galaxies.seed.json`           (curated entries)
 *   - `public/data/2mrs.bin`, `public/data/glade.bin`  (for cross-match)
 *
 * Writes:
 *   - `public/data/famous.bin`         (v4 PointCloud, normal renderer input)
 *   - `public/data/famous_xrefs.json`  (cross-match sidecar)
 *   - `public/data/famous_meta.json`   (per-localIdx → id + names + description)
 *
 * Why three artefacts instead of one fat .bin?  The .bin has to stay in
 * the v4 PointCloud format so the existing decoder + renderer code paths
 * work unchanged.  That format has no slot for human-readable strings.
 * Sidecar JSONs carry the curated metadata + cross-refs, loaded once at
 * startup and indexed by local-idx parallel to the .bin's count.
 *
 * Cross-match strategy:
 *   For each famous entry, compute its Cartesian (x, y, z) and find the
 *   nearest 2MRS or GLADE point within MATCH_THRESHOLD_ARCSEC.  We
 *   compare positions using a small-angle great-circle approximation
 *   (Euclidean distance / target_distance, in radians, converted to
 *   arcseconds) — exact enough at the < 30 arcsec scale we care about,
 *   no trig.
 *
 * Run order: this script depends on the survey .bin files, so always
 * after `npm run build-all`.  The npm script lives at `build-famous`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFamousSeed, type FamousEntry } from './parsers/famousSeed.js';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat.js';
import { Source } from '../src/data/sources.js';
import { fallbackOrientation } from '../src/utils/random/fallbackOrientation.js';
import type { PointCloud } from '../src/@types/data/PointCloud.js';

/** Threshold (arcsec) within which a 2MRS/GLADE point is treated as the same galaxy. */
const MATCH_THRESHOLD_ARCSEC = 30;

/** A subset of PointCloud sufficient for our nearest-neighbour search. */
type CloudPositions = { count: number; positions: Float32Array };

/**
 * Public for tests: find the closest point in `cloud` to `xyz`, returning
 * its local index and approximate angular distance in arcsec, or null
 * when nothing falls within `thresholdArcsec`.
 *
 * Why an angular threshold (not Euclidean Mpc)?  A 30-arcsec catalog
 * cross-match tolerance is the standard astronomical convention, and it
 * scales naturally with distance (1 arcsec is bigger in Mpc at GLADE
 * scales than at 2MRS scales).
 *
 * Why compare unit vectors (angular separation) rather than raw Euclidean
 * distance?  Survey bins store galaxy positions derived from spectroscopic
 * redshifts, which can be wildly wrong for nearby galaxies.  M31 has
 * cz = -300 km/s (peculiar velocity dominates Hubble flow), so Hubble's
 * law gives a negative "distance" and the stored xyz ends up nowhere near
 * the true 0.78 Mpc position.  A unit-vector dot-product gives the *sky
 * direction* match that astronomers mean when they say "30 arcsec
 * cross-match radius" — independent of the stored distance.
 *
 * The arcsec estimate uses the formula for great-circle angular distance:
 *   theta_rad = arccos(dot(u_query, u_catalog))
 *   arcsec    = theta_rad × 206265
 */
export function findNearestPoint(
  cloud: CloudPositions,
  xyz: readonly [number, number, number],
  thresholdArcsec: number,
): { localIdx: number; distanceArcsec: number } | null {
  const [tx, ty, tz] = xyz;
  const targetDist = Math.hypot(tx, ty, tz);
  if (targetDist === 0) return null;

  // Compute the unit vector for the query point's sky direction.
  const ux = tx / targetDist;
  const uy = ty / targetDist;
  const uz = tz / targetDist;

  let bestIdx = -1;
  let bestAngSep = Infinity; // radians
  for (let i = 0; i < cloud.count; i++) {
    const px = cloud.positions[i * 3 + 0]!;
    const py = cloud.positions[i * 3 + 1]!;
    const pz = cloud.positions[i * 3 + 2]!;
    const pdist = Math.hypot(px, py, pz);
    if (pdist === 0) continue;
    // Dot product of unit vectors → cos(angular separation).
    const dot = (ux * px + uy * py + uz * pz) / pdist;
    // Clamp to [-1, 1] to guard against float rounding past ±1.
    const angSep = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (angSep < bestAngSep) {
      bestAngSep = angSep;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  // Convert radians → arcsec and apply threshold.
  const distanceArcsec = bestAngSep * 206265;
  if (distanceArcsec > thresholdArcsec) return null;
  return { localIdx: bestIdx, distanceArcsec };
}

/**
 * Convert a curated entry's (RA, Dec, distanceMpc) to Cartesian (x, y, z).
 * Same convention as `raDecZToCartesian` but with an explicit distance
 * (we don't have a redshift for nearby objects).
 */
function entryToXyz(e: FamousEntry): [number, number, number] {
  const ra = (e.ra * Math.PI) / 180;
  const dec = (e.dec * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  const d = e.distanceMpc;
  return [d * cosDec * Math.cos(ra), d * cosDec * Math.sin(ra), d * Math.sin(dec)];
}

type Xref = { source: 'TwoMRS' | 'Glade'; localIdx: number; distanceArcsec: number };

async function main(): Promise<void> {
  const seedPath = resolve('data/famous_galaxies.seed.json');
  const outDir = resolve('public/data');
  const twomrsPath = resolve(outDir, '2mrs.bin');
  const gladePath = resolve(outDir, 'glade.bin');
  if (!existsSync(twomrsPath) || !existsSync(gladePath)) {
    process.stderr.write(
      'error: 2mrs.bin and/or glade.bin missing.  Run `npm run build-all` first.\n',
    );
    process.exit(1);
  }

  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`loaded ${entries.length} famous entries from seed\n`);

  // Decode the survey clouds for cross-match.  Both files load fully into
  // memory — fine at our scale (~2 + ~127 MB).
  const twomrs = decodePointCloud(readFileSync(twomrsPath).buffer.slice(0));
  const glade = decodePointCloud(readFileSync(gladePath).buffer.slice(0));
  process.stderr.write(`cross-match against ${twomrs.count} 2MRS + ${glade.count} GLADE\n`);

  // ── Build the PointCloud + sidecar maps in lock-step ─────────────────
  const count = entries.length;
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count).fill(NaN),
    magG: new Float32Array(count).fill(NaN),
    magR: new Float32Array(count).fill(NaN),
    magI: new Float32Array(count).fill(NaN),
    magZ: new Float32Array(count).fill(NaN),
    axisRatio: new Float32Array(count).fill(NaN),
    positionAngleDeg: new Float32Array(count).fill(NaN),
    diameterKpc: new Float32Array(count),
  };
  const xrefs: Record<string, Xref | null> = {};
  const metaByIdx: Array<{
    id: string;
    names: string[];
    description: string;
    type: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    const e = entries[i]!;
    const xyz = entryToXyz(e);
    cloud.objIDs[i] = BigInt(i); // sequential placeholder; not a real SDSS objID
    cloud.positions[i * 3 + 0] = xyz[0];
    cloud.positions[i * 3 + 1] = xyz[1];
    cloud.positions[i * 3 + 2] = xyz[2];
    cloud.diameterKpc[i] = e.diameterKpc;
    // Optional enrichment fields (populated by `expandFamousFromCatalogs`).
    // Each is independent — a seed entry may carry orientation without
    // photometry, or any subset.  Absent fields stay at NaN (the array's
    // `.fill(NaN)` initial value), which the renderer/colour-index code
    // treats as "no measurement, fall back to defaults".
    // Orientation: bake real values when both axisRatio AND positionAngleDeg
    // are present; otherwise emit the deterministic fallback for THIS row.
    //
    // We must bake fallback values rather than leaving NaN, because the
    // pointRenderer detects fallback rows by EXACT equality with what
    // `fallbackOrientation()` produces (via `Float32Array` round-tripped
    // floats).  NaN never equals anything, so a NaN slot would slip past
    // the detection AND then propagate NaN into the vertex attributes,
    // making the orientation-disk shader render an axis-aligned square.
    //
    // Partial measurements (axisRatio without PA, or vice versa) get the
    // full fallback pair — mixing one real number with one hashed number
    // would be a worst-of-both-worlds stable orientation that's still
    // arbitrary.  Keep the renderer's "real vs fallback" check binary.
    if (e.axisRatio != null && e.positionAngleDeg != null) {
      cloud.axisRatio[i] = e.axisRatio;
      cloud.positionAngleDeg[i] = e.positionAngleDeg;
    } else {
      const fb = fallbackOrientation(cloud.objIDs[i]!, e.ra, e.dec);
      cloud.axisRatio[i] = fb.axisRatio;
      cloud.positionAngleDeg[i] = fb.positionAngleDeg;
    }
    // Photometric mapping: HyperLEDA gives B/V/K, the PointCloud arrays
    // are SDSS-shaped (u/g/r/i/z).  Same shoehorn convention as GLADE:
    // map B→G, V→R, K→I.  magU/magZ stay NaN — HyperLEDA doesn't carry
    // them and we'd rather have honest "missing" than fabricated values.
    if (e.magB != null) cloud.magG[i] = e.magB;
    if (e.magV != null) cloud.magR[i] = e.magV;
    if (e.magK != null) cloud.magI[i] = e.magK;

    // Cross-match against 2MRS first (denser at the famous-galaxy scale),
    // then GLADE for entries 2MRS missed.
    const m2 = findNearestPoint(twomrs, xyz, MATCH_THRESHOLD_ARCSEC);
    let xr: Xref | null;
    if (m2) {
      xr = { source: 'TwoMRS', localIdx: m2.localIdx, distanceArcsec: m2.distanceArcsec };
    } else {
      const mG = findNearestPoint(glade, xyz, MATCH_THRESHOLD_ARCSEC);
      xr = mG
        ? { source: 'Glade', localIdx: mG.localIdx, distanceArcsec: mG.distanceArcsec }
        : null;
    }
    xrefs[e.id] = xr;
    metaByIdx.push({ id: e.id, names: e.names, description: e.description, type: e.type });
    process.stderr.write(
      `  ${e.id.padEnd(12)} → ${xr ? `${xr.source}#${xr.localIdx} (${xr.distanceArcsec.toFixed(1)}\")` : 'no match'}\n`,
    );
  }

  // ── Write the artefacts ──────────────────────────────────────────────
  const binBuf = encodePointCloud(cloud);
  writeFileSync(resolve(outDir, 'famous.bin'), Buffer.from(binBuf));
  process.stderr.write(`wrote ${count} points to famous.bin (${binBuf.byteLength} bytes)\n`);
  writeFileSync(resolve(outDir, 'famous_xrefs.json'), JSON.stringify(xrefs, null, 2));
  process.stderr.write(`wrote famous_xrefs.json\n`);
  writeFileSync(resolve(outDir, 'famous_meta.json'), JSON.stringify(metaByIdx, null, 2));
  process.stderr.write(`wrote famous_meta.json\n`);

  // Quick sanity reference: log the Source enum value baked into the
  // renderer.  The renderer keys per-source pipelines on this number,
  // so a mismatch would silently misroute Famous draws into the wrong
  // pipeline — better to have it in the build log too.
  process.stderr.write(`Source.Famous = ${Source.Famous}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
