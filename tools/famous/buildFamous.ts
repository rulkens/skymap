#!/usr/bin/env node
/**
 * buildFamous — assemble the curated `Famous` source layer.
 *
 * Reads:
 *   - `data/famous_galaxies.seed.json`           (curated entries)
 *
 * Writes:
 *   - `public/data/famous.bin`         (GalaxyCatalog, normal renderer input)
 *   - `public/data/famous_meta.json`   (per-localIdx → id + names + description)
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

import { parseFamousSeed, type FamousEntry } from '../parsers/famousSeed.js';
import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalogFormat.js';
import { Source } from '../../src/data/sources.js';
import { fallbackOrientation } from '../../src/utils/random/fallbackOrientation.js';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog.js';
import type { FamousMetaEntry } from '../../src/@types/loading/FamousMetaEntry.js';
import { rawDataPath } from '../utils/io/rawDataRegistry.js';
import { parseRecipe, type Recipe } from '../famous-curator/plugin/recipe.js';
import { curatedGalaxyDir } from '../famous-curator/plugin/paths.js';
import { deriveFamousCalibration } from './deriveFamousCalibration.js';
import { willDeproject } from './deprojectDisk.js';

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
 * Build the `FamousMetaEntry[]` sidecar from the seed entries + resolved
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
export function assembleFamousMeta(
  entries: readonly FamousEntry[],
  axisRatios: ArrayLike<number>,
  readRecipe: (id: string) => Recipe | undefined,
): FamousMetaEntry[] {
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
            return deriveFamousCalibration({
              disk,
              crop: recipe!.crop,
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
    // Photometric mapping: HyperLEDA gives B/V/K, the GalaxyCatalog arrays
    // are SDSS-shaped (u/g/r/i/z).  Same shoehorn convention as GLADE:
    // map B→G, V→R, K→I.  magU/magZ stay NaN — HyperLEDA doesn't carry
    // them and we'd rather have honest "missing" than fabricated values.
    if (e.magB != null) cloud.magG[i] = e.magB;
    if (e.magV != null) cloud.magR[i] = e.magV;
    if (e.magK != null) cloud.magI[i] = e.magK;
  }

  // Build the meta sidecar after the cloud loop so cloud.axisRatio is fully
  // populated (including fallback values) before calibration derivation reads it.
  const metaByIdx: FamousMetaEntry[] = assembleFamousMeta(entries, cloud.axisRatio, (id) =>
    readCuratedRecipe(process.cwd(), id),
  );

  // ── Write the artefacts ──────────────────────────────────────────────
  const binBuf = encodeGalaxyCatalog(cloud);
  writeFileSync(resolve(outDir, 'famous.bin'), Buffer.from(binBuf));
  process.stderr.write(`wrote ${count} points to famous.bin (${binBuf.byteLength} bytes)\n`);
  writeFileSync(resolve(outDir, 'famous_meta.json'), JSON.stringify(metaByIdx, null, 2));
  process.stderr.write(`wrote famous_meta.json\n`);

  // Quick sanity reference: log the Source enum value baked into the
  // renderer.  The renderer keys per-source pipelines on this number,
  // so a mismatch would silently misroute Famous draws into the wrong
  // pipeline — better to have it in the build log too.
  process.stderr.write(`Source.Famous = ${Source.Famous}\n`);
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
