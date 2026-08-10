#!/usr/bin/env node
/**
 * buildFamous — assemble the curated `Famous` source layer.
 *
 * Reads:
 *   - `data/seeds/famous_galaxies.seed.json`           (curated entries)
 *
 * Writes:
 *   - `public/data/famous.bin`         (GalaxyCatalog, normal renderer input)
 *   - `public/data/famous_galaxies_meta.json`   (per-localIdx → id + names + description)
 *
 * Why two artefacts instead of one fat .bin?  The .bin has to stay in
 * the GalaxyCatalog format so the existing decoder + renderer code paths
 * work unchanged.  That format has no slot for human-readable strings.
 * The sidecar JSON carries the curated metadata, loaded once at startup
 * and indexed by local-idx parallel to the .bin's count.
 *
 * Run order: this script depends on the survey .bin files (build-tiers
 * outputs are needed by buildAllBins's famous-dedup pass), so always run
 * after `npm run build-tiers`. The npm script lives at `build-famous`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFamousSeed, type FamousEntry } from '../parsers/famousSeed';
import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { Source } from '../../src/data/sources';
import { resolveFamousOrientation } from './resolveFamousOrientation';
import type { GalaxyCatalog } from '../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousGalaxyMetaEntry } from '../../src/@types/loading/FamousGalaxyMetaEntry';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { parseRecipe, type Recipe } from '../famous-curator/plugin/recipe';
import { curatedGalaxyDir } from '../famous-curator/plugin/paths';
import { deriveFamousCalibration } from './deriveFamousCalibration';
import { willDeproject } from './deprojectDisk';
import { squareDeprojectCrop } from './squareDeprojectCrop';
import { writeMetaSidecar } from '../curation/writeMetaSidecar';
import { estimateLog10StellarMass } from '../catalog/estimateLog10StellarMass';

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

/**
 * Read and parse the recipe.json for `id` under the curated galaxy directory.
 *
 * Returns undefined when the recipe file doesn't exist (the common case —
 * most galaxies are uncalibrated) or when parsing fails (legacy/corrupt JSON
 * must not crash the whole build).  Corrupt files emit a console.warn so the
 * operator knows something needs attention without halting the pipeline.
 */
export function readCuratedRecipe(repoRoot: string, id: string): Recipe | undefined {
  const path = resolve(curatedGalaxyDir(repoRoot, id), 'recipe.json');
  if (!existsSync(path)) return undefined;
  try {
    return parseRecipe(readFileSync(path, 'utf8'));
  } catch (err) {
    console.warn(
      `buildFamous: skipping corrupt recipe for ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

/**
 * Build the `FamousGalaxyMetaEntry[]` sidecar from the seed entries + resolved
 * axis-ratio array + an injected recipe reader.
 *
 * Injecting `readRecipe` decouples this pure assembler from filesystem I/O,
 * making it testable without touching disk.  The build's `main()` passes
 * `readCuratedRecipe` bound to `process.cwd()`.
 *
 * For each entry, if the recipe has a `disk` annotation, `deriveFamousCalibration`
 * is called with the same deproject logic the export pipeline used, so the
 * calibration in the JSON exactly matches what the shipped WebP looks like.
 */
export function assembleFamousGalaxiesMeta(
  entries: readonly FamousEntry[],
  axisRatios: ArrayLike<number>,
  readRecipe: (id: string) => Recipe | undefined,
): FamousGalaxyMetaEntry[] {
  return entries.map((e, i) => {
    const recipe = readRecipe(e.id);
    const disk = recipe?.disk;

    const calibration =
      disk !== undefined
        ? (() => {
            // effectiveAxisRatio mirrors the export pipeline's precedence:
            // the curator-drawn disk.axisRatio takes priority over the catalog
            // value, falling back to axisRatios[i] when absent.
            const effectiveAxisRatio = disk.axisRatio ?? axisRatios[i]!;
            const deprojected = disk.deproject && willDeproject(effectiveAxisRatio);
            // The shipped WebP is deprojected from the SQUARE-normalised crop,
            // not the recipe's annotation crop, so calibration must be derived
            // from that same normalised frame to describe the actual pixels —
            // the export route does the identical snap before deriving.
            const crop = deprojected
              ? squareDeprojectCrop(recipe!.crop, disk, effectiveAxisRatio)
              : recipe!.crop;
            return deriveFamousCalibration({
              disk,
              crop,
              catalogAxisRatio: axisRatios[i]!,
              deprojected,
            });
          })()
        : undefined;

    return {
      id: e.id,
      names: e.names,
      description: e.description,
      type: e.type,
      ...(e.commonName !== undefined ? { commonName: e.commonName } : {}),
      ...(calibration !== undefined ? { calibration } : {}),
    };
  });
}

async function main(): Promise<void> {
  const seedPath = rawDataPath('famous.seed');
  const outDir = resolve('public/data');

  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`loaded ${entries.length} famous entries from seed\n`);

  // ── Build the GalaxyCatalog + meta sidecar in lock-step ──────────────
  const count = entries.length;
  const cloud: GalaxyCatalog = {
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
    // Famous entries have no AGN class signal and no Milliquas
    // parent-survey prefix; both bytes stay 0.
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
    orientationIsFallback: new Uint8Array(count),
    // Famous entries always carry a curated real diameter (e.diameterKpc), so
    // no row is a flat-default fallback; every flag stays 0.
    diameterIsFallback: new Uint8Array(count),
    log10StellarMass: new Float32Array(count),
  };

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
    //
    // Orientation is resolved field-by-field: keep every real measurement and
    // fall back ONLY the genuinely-missing one.  Most famous galaxies are
    // near-face-on showpieces with a real axisRatio (HyperLEDA logR25) but no
    // measured PA — discarding that axis ratio just because PA is absent baked
    // a random ~0.53/58° tilt onto galaxies that are really ~0.96 face-on.
    //
    // We always bake a deterministic value (never NaN): NaN would slip past
    // the renderer's fallback detector AND propagate into the vertex
    // attributes, collapsing the orientation disk.  The detector keys on BOTH
    // fields equalling the hash, so a real-axisRatio + fallback-PA row is
    // correctly read as real — and an arbitrary PA on a near-circular disk is
    // visually irrelevant.  See `resolveFamousOrientation`.
    const orient = resolveFamousOrientation({
      axisRatio: e.axisRatio,
      positionAngleDeg: e.positionAngleDeg,
      objID: cloud.objIDs[i]!,
      ra: e.ra,
      dec: e.dec,
    });
    cloud.axisRatio[i] = orient.axisRatio;
    cloud.positionAngleDeg[i] = orient.positionAngleDeg;
    // Provenance flag mirrors the field-by-field resolution above: a row is a
    // true orientation fallback only when BOTH the axis ratio AND the PA were
    // synthesised (the seed carried neither). A real axisRatio paired with a
    // hash-filled PA (the common near-face-on showpiece) stays flagged 0 —
    // its shape is a real measurement.
    cloud.orientationIsFallback[i] = e.axisRatio == null && e.positionAngleDeg == null ? 1 : 0;
    // Photometric mapping: HyperLEDA gives B/V/K, the GalaxyCatalog arrays
    // are SDSS-shaped (u/g/r/i/z).  Same shoehorn convention as GLADE:
    // map B→G, V→R, K→I.  magU/magZ stay NaN — HyperLEDA doesn't carry
    // them and we'd rather have honest "missing" than fabricated values.
    if (e.magB != null) cloud.magG[i] = e.magB;
    if (e.magV != null) cloud.magR[i] = e.magV;
    if (e.magK != null) cloud.magI[i] = e.magK;
    // Stellar mass estimate, fed the same B/G, V/R mapping above and the
    // adopted distance from entryToXyz — after the photometry assignment
    // so the estimator sees the filled mags, not the NaN pre-fill.
    cloud.log10StellarMass[i] = estimateLog10StellarMass({
      source: Source.FamousGalaxy,
      magU: cloud.magU[i]!,
      magG: cloud.magG[i]!,
      magR: cloud.magR[i]!,
      magI: cloud.magI[i]!,
      magZ: cloud.magZ[i]!,
      distMpc: Math.hypot(xyz[0], xyz[1], xyz[2]),
    });
  }

  // Build the meta sidecar after the cloud loop so cloud.axisRatio is fully
  // populated (including fallback values) before calibration derivation reads it.
  const metaByIdx: FamousGalaxyMetaEntry[] = assembleFamousGalaxiesMeta(
    entries,
    cloud.axisRatio,
    (id) => readCuratedRecipe(process.cwd(), id),
  );

  // ── Write the artefacts ──────────────────────────────────────────────
  const binBuf = encodeGalaxyCatalog(cloud);
  writeFileSync(resolve(outDir, 'famous.bin'), Buffer.from(binBuf));
  process.stderr.write(`wrote ${count} points to famous.bin (${binBuf.byteLength} bytes)\n`);
  writeMetaSidecar(metaByIdx, resolve(outDir, 'famous_galaxies_meta.json'));
  process.stderr.write(`wrote famous_galaxies_meta.json\n`);

  // Quick sanity reference: log the Source enum value baked into the
  // renderer.  The renderer keys per-source pipelines on this number,
  // so a mismatch would silently misroute Famous draws into the wrong
  // pipeline — better to have it in the build log too.
  process.stderr.write(`Source.FamousGalaxy = ${Source.FamousGalaxy}\n`);
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
