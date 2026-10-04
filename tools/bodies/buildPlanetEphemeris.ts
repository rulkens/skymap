#!/usr/bin/env node
/**
 * buildPlanetEphemeris — fit each planet's `Horizons − Kepler` residual (1900–2100) into the
 * committed `PLANET_EPHEMERIS_CORRECTIONS` table. Kepler is the app's own path
 * (`keplerianPositionMpc(propagateElements(row, jd))`), so any element-row or frame edit needs a
 * rerun. Fits on a coarse grid to 900 km, then verifies the ROUNDED values, as they will be
 * parsed from the emitted file, through `ephemerisCorrectionMpc` on every 1-day row; throws
 * above 1,000 km. Reads `data/raw/horizons/planets/` (`npm run fetch-horizons-planets`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';

import { elementsById } from '../../src/data/bodies/orbitalElements';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { ephemerisCorrectionMpc } from '../../src/utils/orbit/ephemerisCorrectionMpc';
import { keplerianPositionMpc } from '../../src/utils/orbit/keplerianPositionMpc';
import { propagateElements } from '../../src/utils/orbit/propagateElements';
import type { EphemerisCorrection } from '../../src/@types/scene/EphemerisCorrection';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { fitSinusoidSeries } from '../utils/math/fitSinusoidSeries';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const GENERATED_PATH = 'src/data/bodies/planetEphemerisCorrections.generated.ts';
const GENERATED_BANNER =
  `// ${GENERATED_PATH}\n` +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run fetch-horizons-planets && npm run build-planet-ephemeris\n' +
  '// Source of truth:  data/raw/horizons/planets/ (JPL Horizons) minus orbitalElements.ts\n';

// [planet id, Horizons target, fit sample step in days]. The step keeps ≥ ~20 samples
// across the shortest period the residual carries.
const PLANETS: readonly [string, string, number][] = [
  ['mercury', '199', 2],
  ['venus', '299', 4],
  ['earth', '3', 4],
  ['mars', '4', 6],
  ['jupiter', '5', 10],
  ['saturn', '6', 10],
  ['uranus', '7', 10],
  ['neptune', '8', 10],
];
const FIT_STOP_KM = 900;
const VERIFY_MAX_KM = 1000;
const MAX_TERMS = 400;
const KM_TO_MPC = SCALE_UNITS.KM_TO_MPC;

// ω to 12 significant digits: over the 73,000-day span its phase error stays < 1e-7 rad.
// Amplitudes to 0.1 km: hundreds of 0.05 km roundings sum to well under a kilometre.
const fmtOmega = (x: number): string => String(Number(x.toPrecision(12)));
const fmtKm = (x: number): string => String(Math.round(x * 10) / 10);

function readSeries(naif: string) {
  const lines = readFileSync(join(rawDataPath('horizons.planets'), `${naif}.csv`), 'utf8')
    .trim()
    .split('\n')
    .slice(1);
  const cols = [0, 1, 2, 3].map(() => new Float64Array(lines.length));
  lines.forEach((line, i) => line.split(',').forEach((v, c) => (cols[c]![i] = Number(v))));
  return { jd: cols[0]!, km: [cols[1]!, cols[2]!, cols[3]!] as const };
}

function keplerKm(id: string, jd: number): Vec3 {
  const [x, y, z] = keplerianPositionMpc(propagateElements(elementsById(id), jd));
  return [x / KM_TO_MPC, y / KM_TO_MPC, z / KM_TO_MPC];
}

/** Emit one correction's literal, and the correction those exact digits parse back to. */
function emit(
  startJd: number,
  endJd: number,
  polyKm: readonly Vec3[],
  terms: readonly number[],
): { text: string; shipped: EphemerisCorrection } {
  const polyText = polyKm.map((v) => v.map(fmtKm));
  const termText = terms.map((v, i) => (i % 7 === 0 ? fmtOmega(v) : fmtKm(v)));
  const parse = (s: readonly string[]): number[] => s.map(Number);
  const shipped: EphemerisCorrection = {
    startJd,
    endJd,
    polyKm: polyText.map(parse) as unknown as EphemerisCorrection['polyKm'],
    terms: parse(termText),
  };
  const text =
    `{ startJd: ${startJd}, endJd: ${endJd}, ` +
    `polyKm: [${polyText.map((v) => `[${v.join(', ')}]`).join(', ')}], ` +
    `terms: [${termText.join(', ')}] }`;
  return { text, shipped };
}

function buildPlanet(id: string, naif: string, step: number): { text: string; summary: string } {
  const { jd, km } = readSeries(naif);
  const startJd = jd[0]!;
  const endJd = jd[jd.length - 1]!;

  // Every `step`-th row, plus the last row so the fit is never extrapolating at the end.
  const last = jd.length - 1;
  const sampleIdx = Array.from({ length: Math.ceil(last / step) + 1 }, (_, i) =>
    Math.min(i * step, last),
  );
  const tJd = Float64Array.from(sampleIdx, (i) => jd[i]!);
  const kepler = sampleIdx.map((i) => keplerKm(id, jd[i]!));
  const residual = [0, 1, 2].map((axis) =>
    Float64Array.from(sampleIdx, (i, s) => km[axis]![i]! - kepler[s]![axis]!),
  );
  const fit = fitSinusoidSeries(
    tJd,
    [residual[0]!, residual[1]!, residual[2]!],
    startJd,
    endJd,
    FIT_STOP_KM,
    MAX_TERMS,
  );
  const { text, shipped } = emit(startJd, endJd, fit.polyKm, fit.terms);

  let maxKm = 0;
  for (let i = 0; i < jd.length; i++) {
    const kepler = keplerKm(id, jd[i]!);
    const corr = ephemerisCorrectionMpc(shipped, jd[i]!);
    const err = [0, 1, 2].map((a) => km[a]![i]! - (kepler[a]! + corr[a]! / KM_TO_MPC));
    maxKm = Math.max(maxKm, Math.hypot(err[0]!, err[1]!, err[2]!));
  }
  const nTerms = fit.terms.length / 7;
  const summary = `${id}: ${nTerms} terms, max ${Math.round(maxKm)} km vs Horizons (1-day grid)`;
  if (maxKm > VERIFY_MAX_KM)
    throw new Error(`buildPlanetEphemeris: ${summary} exceeds ${VERIFY_MAX_KM} km`);
  return { text: `  // ${summary}\n  ${id}: ${text},`, summary };
}

async function main(): Promise<void> {
  const rows: string[] = [];
  for (const [id, naif, step] of PLANETS) {
    const { text, summary } = buildPlanet(id, naif, step);
    process.stderr.write(`${summary}\n`);
    rows.push(text);
  }
  const source =
    GENERATED_BANNER +
    "import type { EphemerisCorrection } from '../../@types/scene/EphemerisCorrection';\n\n" +
    'export const PLANET_EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>> = {\n' +
    `${rows.join('\n')}\n};\n`;
  const outPath = resolve(GENERATED_PATH);
  const formatted = await format(source, {
    ...(await resolveConfig(outPath)),
    parser: 'typescript',
  });
  writeFileSync(outPath, formatted);
  process.stderr.write(`wrote ${GENERATED_PATH} (${(formatted.length / 1024).toFixed(1)} kB)\n`);
}

await main();
