/**
 * Binary on-disk format for a `GalaxyCatalog` — version 8.
 *
 * v8 consumes 1 of v7's 5 trailing padding bytes for a second per-record
 * uint8 provenance field, alongside the v7 `orientationIsFallback`:
 *
 *   - `orientationIsFallback` (offset 58, uint8): 1 when the row's
 *     (axisRatio, positionAngleDeg) pair is a deterministic
 *     hash-based fallback (the source catalog had no measured
 *     orientation), 0 when it is a real measurement.
 *
 *   - `diameterIsFallback` (offset 59, uint8): 1 when `diameterKpc` is the
 *     flat DEFAULT_GALAXY_DIAMETER_KPC = 30 fallback (the parser had no
 *     measured size AND no angular size to re-derive one), 0 when it is a
 *     real / angular-derived / curated measurement.
 *
 *     Both fields persist the build-side truth. `recordsToCloud` KNOWS which
 *     rows fell through to a fallback — it makes that very decision — so it
 *     stamps each flag directly. The alternative (reconstructing on load) is
 *     lossy: for orientation the pre-v7 code re-hashed `fallbackOrientation`
 *     from the baked f32 position and compared floats (f32 cartesian →
 *     `cartesianToRaDec` → hash bucketed at `Math.round(ra * 1e5)`), so ~10 %
 *     of true fallback rows were misclassified; for diameter the InfoCard
 *     compared `diameterKpc === 30`, which cannot tell a real 30-kpc
 *     measurement apart from the default. Persisting one authoritative byte
 *     per field beats both reconstructions outright.
 *
 * Other than the new field, the per-record layout is identical to v7
 * (which itself reuses the v4 64-byte stride). The remaining 4 bytes
 * of tail padding stay reserved for future per-record metadata that
 * fits in the existing stride.
 *
 * v7 (and earlier) files are rejected with the documented "regenerate
 * via `npm run build-tiers`" error — the magic + version header is
 * the single source of truth for "do I understand this file?".
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 8 (uint32)
 *     8       4     count    = number of galaxies (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-GALAXY RECORD (64 bytes) ───────────────────────────────────────
 *     0       8     objID                 (uint64)
 *     8       4     x                     (float32, Mpc)
 *     12      4     y                     (float32)
 *     16      4     z                     (float32)
 *     20      4     magU                  (float32)
 *     24      4     magG                  (float32)
 *     28      4     magR                  (float32)
 *     32      4     magI                  (float32)
 *     36      4     magZ                  (float32)
 *     40      4     axisRatio             (float32) — b/a in [0,1] or NaN
 *     44      4     positionAngleDeg      (float32) — PA in [0,180) or NaN
 *     48      4     diameterKpc           (float32) — physical diameter in kpc
 *     52      1     classByte             (uint8)  — per-source enum
 *     53      1     parentSurveyByte      (uint8)  — Milliquas-only
 *     54      4     spectroscopicZ        (float32)
 *     58      1     orientationIsFallback (uint8)  — v7; 1 = fallback
 *     59      1     diameterIsFallback    (uint8)  — NEW in v8; 1 = fallback
 *     60      4     padding               (zeroed)
 *
 * Total file size: 16 + count × 64.
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import { galaxyMeanAbsMag } from '../../utils/galaxy/galaxyMeanAbsMag';

const MAGIC = 0x504d4b53;
const VERSION = 8;
const HEADER_BYTES = 16;
const BYTES_PER_GALAXY = 64;

export function encodeGalaxyCatalog(catalog: GalaxyCatalog): ArrayBuffer {
  const {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
    classByte,
    parentSurveyByte,
    spectroscopicZ,
    orientationIsFallback,
    diameterIsFallback,
  } = catalog;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');
  if (axisRatio.length !== count) throw new Error('axisRatio length mismatch');
  if (positionAngleDeg.length !== count) throw new Error('positionAngleDeg length mismatch');
  if (diameterKpc.length !== count) throw new Error('diameterKpc length mismatch');
  if (classByte.length !== count) throw new Error('classByte length mismatch');
  if (parentSurveyByte.length !== count) throw new Error('parentSurveyByte length mismatch');
  if (spectroscopicZ.length !== count) throw new Error('spectroscopicZ length mismatch');
  if (orientationIsFallback.length !== count)
    throw new Error('orientationIsFallback length mismatch');
  if (diameterIsFallback.length !== count)
    throw new Error('diameterIsFallback length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_GALAXY);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;

    dv.setBigUint64(byteBase + 0, objIDs[i]!, true);

    const f = (byteBase + 8) / 4;
    floatView[f + 0] = positions[i * 3 + 0]!;
    floatView[f + 1] = positions[i * 3 + 1]!;
    floatView[f + 2] = positions[i * 3 + 2]!;
    floatView[f + 3] = magU[i]!;
    floatView[f + 4] = magG[i]!;
    floatView[f + 5] = magR[i]!;
    floatView[f + 6] = magI[i]!;
    floatView[f + 7] = magZ[i]!;
    floatView[f + 8] = axisRatio[i]!;
    floatView[f + 9] = positionAngleDeg[i]!;
    floatView[f + 10] = diameterKpc[i]!;

    // Two new uint8 slots at byteBase + 52 / + 53.  We index the
    // shared Uint8Array view directly rather than going through
    // DataView.setUint8 — one fewer call per byte and the alignment
    // is trivially 1.
    byteView[byteBase + 52] = classByte[i]!;
    byteView[byteBase + 53] = parentSurveyByte[i]!;
    // spectroscopicZ sits at offset 54, which is NOT 4-aligned within
    // the 8-byte-aligned `f` shortcut (54 = 13*4 + 2), so we take the
    // DataView setFloat32 path instead. It has no alignment requirement.
    dv.setFloat32(byteBase + 54, spectroscopicZ[i]!, true);
    // Single uint8 orientation-provenance flag at byteBase + 58 (see the
    // classByte/parentSurveyByte note above for why we index the shared
    // Uint8Array view directly).
    byteView[byteBase + 58] = orientationIsFallback[i]!;
    // Single uint8 diameter-provenance flag at byteBase + 59.
    byteView[byteBase + 59] = diameterIsFallback[i]!;
    // Tail padding (byteBase+60 … byteBase+63) stays zero because
    // `new ArrayBuffer` zero-inits.  No write needed.
  }
  return buf;
}

export function decodeGalaxyCatalog(buf: ArrayBuffer): GalaxyCatalog {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');

  // Mismatch surfaces as the documented "regenerate" error. Stale .bin
  // files (last built before this format version landed) trigger this on
  // every reload until `npm run build-tiers` is re-run. The error
  // message itself is the cure — keep it instructive.
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-tiers"`,
    );
  }

  const count = dv.getUint32(8, true);

  const objIDs = new BigUint64Array(count);
  const positions = new Float32Array(count * 3);
  const magU = new Float32Array(count);
  const magG = new Float32Array(count);
  const magR = new Float32Array(count);
  const magI = new Float32Array(count);
  const magZ = new Float32Array(count);
  const axisRatio = new Float32Array(count);
  const positionAngleDeg = new Float32Array(count);
  const diameterKpc = new Float32Array(count);
  const classByte = new Uint8Array(count);
  const parentSurveyByte = new Uint8Array(count);
  const spectroscopicZ = new Float32Array(count);
  const orientationIsFallback = new Uint8Array(count);
  const diameterIsFallback = new Uint8Array(count);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;

    objIDs[i] = dv.getBigUint64(byteBase + 0, true);

    const f = (byteBase + 8) / 4;
    positions[i * 3 + 0] = floatView[f + 0]!;
    positions[i * 3 + 1] = floatView[f + 1]!;
    positions[i * 3 + 2] = floatView[f + 2]!;
    magU[i] = floatView[f + 3]!;
    magG[i] = floatView[f + 4]!;
    magR[i] = floatView[f + 5]!;
    magI[i] = floatView[f + 6]!;
    magZ[i] = floatView[f + 7]!;
    axisRatio[i] = floatView[f + 8]!;
    positionAngleDeg[i] = floatView[f + 9]!;
    diameterKpc[i] = floatView[f + 10]!;

    classByte[i] = byteView[byteBase + 52]!;
    parentSurveyByte[i] = byteView[byteBase + 53]!;
    spectroscopicZ[i] = dv.getFloat32(byteBase + 54, true);
    orientationIsFallback[i] = byteView[byteBase + 58]!;
    diameterIsFallback[i] = byteView[byteBase + 59]!;
    // The remaining 4 padding bytes are ignored on decode.
  }

  const catalog: GalaxyCatalog = {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
    classByte,
    parentSurveyByte,
    spectroscopicZ,
    orientationIsFallback,
    diameterIsFallback,
  };
  // Derived, not stored on disk — recomputed here (rather than encoded)
  // so adding this field never bumps the binary format version. Computed
  // AFTER the object above so the helper sees the finished typed arrays.
  catalog.meanAbsMag = galaxyMeanAbsMag(catalog);
  return catalog;
}

export function emptyGalaxyCatalog(): GalaxyCatalog {
  return {
    count: 0,
    objIDs: new BigUint64Array(0),
    positions: new Float32Array(0),
    magU: new Float32Array(0),
    magG: new Float32Array(0),
    magR: new Float32Array(0),
    magI: new Float32Array(0),
    magZ: new Float32Array(0),
    axisRatio: new Float32Array(0),
    positionAngleDeg: new Float32Array(0),
    diameterKpc: new Float32Array(0),
    classByte: new Uint8Array(0),
    parentSurveyByte: new Uint8Array(0),
    spectroscopicZ: new Float32Array(0),
    meanAbsMag: -20.5, // count-0 fallback — same sentinel galaxyMeanAbsMag returns for count===0.
    orientationIsFallback: new Uint8Array(0),
    diameterIsFallback: new Uint8Array(0),
  };
}
