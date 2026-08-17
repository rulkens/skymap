#!/usr/bin/env node
/**
 * fitPlutoChroma — re-derives Pluto's shipped `ChromaCalibration` so those four
 * numbers are checkable rather than magic. PIA11707 is published ENHANCED
 * colour; the fit inverts that stretch by regressing its chroma onto the
 * true-colour reference disc's over the hemisphere the two share. Every figure
 * below is computed, not restated.
 *
 * Usage:  npm run fit-pluto-chroma [-- --reference <path>]
 * Output: stdout; non-zero exit if the shipped calibration no longer scores as
 *         well as a fresh fit on the same reference.
 */

import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { Vec2 } from '../../src/@types/math/Vec2';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { BODY_TEXTURE_REGISTRY } from '../../src/data/bodies/bodyTextureRegistry';
import { panSharpenRgb } from '../utils/image/panSharpenRgb';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const LUM: Vec3 = [0.2126, 0.7152, 0.0722];

/** Working grids: the reference disc square, and the equirect chroma map. */
const DISC_PX = 768;
const CHROMA_W = 4096;
const CHROMA_H = 2048;

/**
 * Sub-observer pose of the reference disc, registered against the chroma map in
 * the GRADIENT domain. Do not re-solve it by scanning raw-luminance correlation:
 * that objective has a strong FALSE peak near 55°E (shading, not terrain, drives
 * it) which lands the fit on the wrong hemisphere while still looking converged.
 * `westPos` is false — the map runs east-positive, matching the pose's longitudes.
 */
const POSE = {
  lonDeg: 164.6,
  latDeg: 31.1,
  rollDeg: -3.7,
  cxN: 0.4899385828981354,
  cyN: 0.48405152695814113,
  rN: 0.4543755886949328,
} as const;

/** Disc-mean sRGB ratio G:R and B:R of the reference, the anchor `gain` hits. */
const DISC_ANCHOR: Vec2 = [0.938, 0.851];

/** Named terrain, `[name, lon0, lon1, lat0, lat1]` in degrees — the ΔE report. */
const REGIONS: readonly (readonly [string, number, number, number, number])[] = [
  ['Sputnik Planitia N', 170, 200, 8, 35],
  ['Sputnik Planitia S', 175, 200, -12, 8],
  ['Cthulhu Macula', 100, 150, -14, 8],
  ['Lowell Regio (N polar)', 120, 240, 58, 84],
  ['Voyager/Bare (NW)', 130, 165, 33, 55],
  ['E of Tombaugh', 205, 245, 2, 30],
  ['Belton/Safronov (NE)', 215, 260, 35, 60],
];

/** Sampling cuts: dark limb, disc edge, gradient-quiet pixels, tile occupancy. */
const MIN_DISC_LUMA = 32;
const MAX_DISC_RADIUS = 0.88;
const MAX_TILE_GRADIENT = 14;
const MIN_TILE_SAMPLES = 25;
const TILE_DEG = 2;

const D2R = Math.PI / 180;

const toLinear = (u8: number): number => {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const toSrgbByte = (linear: number): number => {
  const c =
    linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(Math.max(linear, 0), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/**
 * Orthonormal basis of the chroma plane, byte-for-byte the construction
 * `panSharpenRgb.chromaBasis()` uses; `crossCheckAgainstShippedCode` below
 * proves the two still agree, because the fitted coefficients are meaningless
 * in any other basis of the same plane.
 */
function chromaBasis(): readonly [Vec3, Vec3] {
  const normalise = (v: Vec3): Vec3 => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const e1 = normalise([1, 0, -LUM[0] / LUM[2]]);
  const seed: Vec3 = [0, 1, -LUM[1] / LUM[2]];
  const overlap = seed[0] * e1[0] + seed[1] * e1[1] + seed[2] * e1[2];
  const e2 = normalise([
    seed[0] - overlap * e1[0],
    seed[1] - overlap * e1[1],
    seed[2] - overlap * e1[2],
  ]);
  return [e1, e2];
}

const [E1, E2] = chromaBasis();

const project = (c: Vec3): Vec2 => [
  c[0] * E1[0] + c[1] * E1[1] + c[2] * E1[2],
  c[0] * E2[0] + c[1] * E2[1] + c[2] * E2[2],
];

const unproject = (p: Vec2): Vec3 => [
  p[0] * E1[0] + p[1] * E2[0],
  p[0] * E1[1] + p[1] * E2[1],
  p[0] * E1[2] + p[1] * E2[2],
];

type Matrix2 = readonly [Vec2, Vec2];

const applyMatrix = (c: Vec3, m: Matrix2): Vec3 => {
  const p = project(c);
  return unproject([m[0][0] * p[0] + m[0][1] * p[1], m[1][0] * p[0] + m[1][1] * p[1]]);
};

/** Least squares for `A x ≈ b` with two unknowns, via the normal equations. */
function solveNormal2(a: readonly Vec2[], b: readonly number[]): Vec2 {
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < a.length; i++) {
    const row = a[i]!;
    a11 += row[0] * row[0];
    a12 += row[0] * row[1];
    a22 += row[1] * row[1];
    b1 += row[0] * b[i]!;
    b2 += row[1] * b[i]!;
  }
  const det = a11 * a22 - a12 * a12;
  return [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det];
}

function coefficientOfDetermination(
  predicted: readonly number[],
  actual: readonly number[],
): number {
  const mean = actual.reduce((sum, v) => sum + v, 0) / actual.length;
  let total = 0;
  let residual = 0;
  for (let i = 0; i < actual.length; i++) {
    total += (actual[i]! - mean) ** 2;
    residual += (actual[i]! - predicted[i]!) ** 2;
  }
  return 1 - residual / total;
}

/** Singular values of a 2x2 — the anisotropy that rules out a scalar gain. */
function singularValues(m: Matrix2): Vec2 {
  const [[a, b], [c, d]] = m;
  const frob = a * a + b * b + c * c + d * d;
  const det = a * d - b * c;
  const disc = Math.sqrt(Math.max(0, frob * frob - 4 * det * det));
  return [Math.sqrt((frob + disc) / 2), Math.sqrt(Math.max(0, (frob - disc) / 2))];
}

/** CIE L*a*b* (D65) from linear sRGB, for the CIE76 ΔE region report. */
function lab(rgbLinear: Vec3): Vec3 {
  const x = 0.4124 * rgbLinear[0] + 0.3576 * rgbLinear[1] + 0.1805 * rgbLinear[2];
  const y = 0.2126 * rgbLinear[0] + 0.7152 * rgbLinear[1] + 0.0722 * rgbLinear[2];
  const z = 0.0193 * rgbLinear[0] + 0.1192 * rgbLinear[1] + 0.9505 * rgbLinear[2];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / 0.95047);
  const fy = f(y);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

type DiscBasis = { o: Vec3; right: Vec3; up: Vec3 };

/** Orthographic viewing frame of the disc: line of sight plus screen axes. */
function discBasis(lon: number, lat: number, roll: number): DiscBasis {
  const o: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const n = Math.hypot(-o[1], o[0]);
  const right: Vec3 = [-o[1] / n, o[0] / n, 0];
  const up: Vec3 = [
    o[1] * right[2] - o[2] * right[1],
    o[2] * right[0] - o[0] * right[2],
    o[0] * right[1] - o[1] * right[0],
  ];
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return {
    o,
    right: [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s],
    up: [-right[0] * s + up[0] * c, -right[1] * s + up[1] * c, -right[2] * s + up[2] * c],
  };
}

/** Disc coords (unit radius, y up) to lon/lat degrees; null off the limb. */
function discToLonLat(x: number, y: number, b: DiscBasis): Vec2 | null {
  const t = 1 - x * x - y * y;
  if (t < 0) return null;
  const z = Math.sqrt(t);
  const p: Vec3 = [
    x * b.right[0] + y * b.up[0] + z * b.o[0],
    x * b.right[1] + y * b.up[1] + z * b.o[1],
    x * b.right[2] + y * b.up[2] + z * b.o[2],
  ];
  let lon = Math.atan2(p[1], p[0]) / D2R;
  if (lon < 0) lon += 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, p[2]))) / D2R];
}

function equirectIndex(lonDeg: number, latDeg: number): number {
  let x = Math.round((lonDeg / 360) * CHROMA_W) % CHROMA_W;
  if (x < 0) x += CHROMA_W;
  const y = Math.min(CHROMA_H - 1, Math.max(0, Math.round(((90 - latDeg) / 180) * CHROMA_H)));
  return y * CHROMA_W + x;
}

async function loadRgb(file: string, w: number, h: number): Promise<Buffer> {
  return sharp(file, { limitInputPixels: false, sequentialRead: true })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer();
}

type Sample = {
  x: number;
  y: number;
  lon: number;
  lat: number;
  yTrue: number;
  smooth: boolean;
  cTrue: Vec3;
  cEnhanced: Vec3;
};

type Tile = { cTrue: Vec3; cEnhanced: Vec3; lon: number };

/**
 * Pair every usable reference-disc pixel with the chroma map pixel it sees.
 * `smooth` marks the gradient-quiet pixels — only those are fitted, so a
 * sub-pixel registration error at a terrain edge cannot bias the regression.
 */
function pairSamples(reference: Buffer, chroma: Buffer): Sample[] {
  const s = DISC_PX;
  const cx = POSE.cxN * s;
  const cy = POSE.cyN * s;
  const radius = POSE.rN * s;
  const basis = discBasis(POSE.lonDeg * D2R, POSE.latDeg * D2R, POSE.rollDeg * D2R);

  const luma = new Float64Array(s * s);
  for (let i = 0; i < s * s; i++) {
    luma[i] =
      LUM[0] * reference[i * 3]! + LUM[1] * reference[i * 3 + 1]! + LUM[2] * reference[i * 3 + 2]!;
  }
  const gradient = new Float64Array(s * s);
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      gradient[y * s + x] = Math.hypot(
        luma[y * s + x + 1]! - luma[y * s + x - 1]!,
        luma[(y + 1) * s + x]! - luma[(y - 1) * s + x]!,
      );
    }
  }

  const samples: Sample[] = [];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (luma[y * s + x]! < MIN_DISC_LUMA) continue;
      const dx = (x - cx) / radius;
      const dy = -(y - cy) / radius;
      if (Math.hypot(dx, dy) > MAX_DISC_RADIUS) continue;
      const lonLat = discToLonLat(dx, dy, basis);
      if (lonLat === null) continue;

      const i = (y * s + x) * 3;
      const j = equirectIndex(lonLat[0], lonLat[1]) * 3;
      const t: Vec3 = [
        toLinear(reference[i]!),
        toLinear(reference[i + 1]!),
        toLinear(reference[i + 2]!),
      ];
      const e: Vec3 = [toLinear(chroma[j]!), toLinear(chroma[j + 1]!), toLinear(chroma[j + 2]!)];
      const yTrue = LUM[0] * t[0] + LUM[1] * t[1] + LUM[2] * t[2];
      const yEnhanced = LUM[0] * e[0] + LUM[1] * e[1] + LUM[2] * e[2];
      if (yTrue <= 1e-4 || yEnhanced <= 1e-4) continue;

      samples.push({
        x,
        y,
        lon: lonLat[0],
        lat: lonLat[1],
        yTrue,
        smooth: gradient[y * s + x]! < MAX_TILE_GRADIENT,
        cTrue: [t[0] / yTrue - 1, t[1] / yTrue - 1, t[2] / yTrue - 1],
        cEnhanced: [e[0] / yEnhanced - 1, e[1] / yEnhanced - 1, e[2] / yEnhanced - 1],
      });
    }
  }
  return samples;
}

/** Average the smooth samples into 2° tiles — one weight per patch of terrain,
 *  so the fit is not dominated by whichever region happens to be largest. */
function tileAverages(samples: readonly Sample[]): Tile[] {
  const bins = new Map<string, { n: number; t: Vec3; e: Vec3; lon: number }>();
  for (const p of samples) {
    if (!p.smooth) continue;
    const key = `${Math.floor(p.lon / TILE_DEG)}_${Math.floor(p.lat / TILE_DEG)}`;
    let bin = bins.get(key);
    if (bin === undefined) {
      bin = { n: 0, t: [0, 0, 0], e: [0, 0, 0], lon: 0 };
      bins.set(key, bin);
    }
    bin.n++;
    bin.lon += p.lon;
    bin.t = [bin.t[0] + p.cTrue[0], bin.t[1] + p.cTrue[1], bin.t[2] + p.cTrue[2]];
    bin.e = [bin.e[0] + p.cEnhanced[0], bin.e[1] + p.cEnhanced[1], bin.e[2] + p.cEnhanced[2]];
  }
  return [...bins.values()]
    .filter((bin) => bin.n >= MIN_TILE_SAMPLES)
    .map((bin) => ({
      cTrue: [bin.t[0] / bin.n, bin.t[1] / bin.n, bin.t[2] / bin.n] as Vec3,
      cEnhanced: [bin.e[0] / bin.n, bin.e[1] / bin.n, bin.e[2] / bin.n] as Vec3,
      lon: bin.lon / bin.n,
    }));
}

function fitMatrix(tiles: readonly Tile[]): Matrix2 {
  const a = tiles.map((t) => project(t.cEnhanced));
  return [
    solveNormal2(
      a,
      tiles.map((t) => project(t.cTrue)[0]),
    ),
    solveNormal2(
      a,
      tiles.map((t) => project(t.cTrue)[1]),
    ),
  ];
}

function scoreMatrix(m: Matrix2, tiles: readonly Tile[]): number {
  const actual: number[] = [];
  const predicted: number[] = [];
  for (const t of tiles) {
    const a = project(t.cTrue);
    const p = project(applyMatrix(t.cEnhanced, m));
    actual.push(a[0], a[1]);
    predicted.push(p[0], p[1]);
  }
  return coefficientOfDetermination(predicted, actual);
}

/**
 * Best single scalar on `[0, ratio]` — the disc-mean sRGB ratio is monotone in
 * the chroma scale, so a fine sweep is exact enough and cannot pick a local
 * minimum the way a gradient step could.
 */
function sweepScale(
  discMeanRatio: (scale: number) => Vec2,
  lo: number,
  hi: number,
): { scale: number; residual: number; ratio: Vec2 } {
  let best = lo;
  let bestError = Infinity;
  for (let s = lo; s <= hi; s += 0.002) {
    const r = discMeanRatio(s);
    const e = (r[0] - DISC_ANCHOR[0]) ** 2 + (r[1] - DISC_ANCHOR[1]) ** 2;
    if (e < bestError) {
      bestError = e;
      best = s;
    }
  }
  return { scale: best, residual: Math.sqrt(bestError), ratio: discMeanRatio(best) };
}

/**
 * Prove this tool's chroma basis and matrix orientation still match the shipped
 * `panSharpenRgb`: a silent basis change there would leave every number below
 * looking healthy while meaning something else. Returns the max byte delta over
 * a hue sweep — 1 is quantisation, more is drift.
 */
function crossCheckAgainstShippedCode(m: Matrix2, gain: number): number {
  const hues: readonly Vec3[] = [
    [210, 170, 120],
    [120, 130, 150],
    [200, 60, 40],
    [90, 200, 110],
    [255, 250, 200],
    [40, 40, 45],
  ];
  const luminance = new Uint8Array(hues.length);
  const chroma = new Uint8Array(hues.length * 3);
  for (let i = 0; i < hues.length; i++) {
    luminance[i] = 160;
    chroma[i * 3] = hues[i]![0];
    chroma[i * 3 + 1] = hues[i]![1];
    chroma[i * 3 + 2] = hues[i]![2];
  }
  const shipped = panSharpenRgb(luminance, chroma, { matrix: m, gain });

  let maxDelta = 0;
  for (let i = 0; i < hues.length; i++) {
    const e: Vec3 = [
      toLinear(chroma[i * 3]!),
      toLinear(chroma[i * 3 + 1]!),
      toLinear(chroma[i * 3 + 2]!),
    ];
    const y = LUM[0] * e[0] + LUM[1] * e[1] + LUM[2] * e[2];
    const c: Vec3 = y > 1e-5 ? [e[0] / y - 1, e[1] / y - 1, e[2] / y - 1] : [0, 0, 0];
    const q = applyMatrix(c, m);
    const lum = toLinear(luminance[i]!);
    for (let k = 0; k < 3; k++) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(toSrgbByte(lum * (1 + gain * q[k]!)) - shipped[i * 3 + k]!),
      );
    }
  }
  return maxDelta;
}

async function fitPlutoChroma(referenceOverride: string | null): Promise<boolean> {
  const referencePath = referenceOverride ?? rawDataPath('textures.nasaPlutoTrueColorRef');
  const chromaPath = rawDataPath('textures.nasaPlutoColor');
  process.stdout.write(`reference disc : ${referencePath}\nchroma map     : ${chromaPath}\n\n`);

  const reference = await loadRgb(referencePath, DISC_PX, DISC_PX);
  const chroma = await loadRgb(chromaPath, CHROMA_W, CHROMA_H);

  const samples = pairSamples(reference, chroma);
  const tiles = tileAverages(samples);
  process.stdout.write(
    `pose lon ${POSE.lonDeg}°E lat ${POSE.latDeg}°N roll ${POSE.rollDeg}°  ` +
      `samples ${samples.length}, fit tiles ${tiles.length}\n\n`,
  );

  // Held out by longitude, not at random: neighbouring pixels of one terrain are
  // not independent, so a random split would leak and flatter the score.
  const median = tiles.map((t) => t.lon).sort((a, b) => a - b)[tiles.length >> 1]!;
  const west = tiles.filter((t) => t.lon < median);
  const east = tiles.filter((t) => t.lon >= median);
  const fromWest = fitMatrix(west);
  const fromEast = fitMatrix(east);
  process.stdout.write(`held-out validation (split at lon ${median.toFixed(0)}°):\n`);
  process.stdout.write(
    `  fit W (${west.length} tiles) -> test E : R^2 = ${scoreMatrix(fromWest, east).toFixed(3)}` +
      `   (in-sample ${scoreMatrix(fromWest, west).toFixed(3)})\n`,
  );
  process.stdout.write(
    `  fit E (${east.length} tiles) -> test W : R^2 = ${scoreMatrix(fromEast, west).toFixed(3)}` +
      `   (in-sample ${scoreMatrix(fromEast, east).toFixed(3)})\n\n`,
  );

  const matrix = fitMatrix(tiles);
  const [s1, s2] = singularValues(matrix);
  process.stdout.write(
    `matrix  [[${matrix[0][0].toFixed(4)}, ${matrix[0][1].toFixed(4)}], ` +
      `[${matrix[1][0].toFixed(4)}, ${matrix[1][1].toFixed(4)}]]   ` +
      `in-sample R^2 = ${scoreMatrix(matrix, tiles).toFixed(3)}\n`,
  );
  process.stdout.write(
    `singular values ${s1.toFixed(3)} / ${s2.toFixed(3)}  (${(s1 / s2).toFixed(1)}x anisotropic — ` +
      `one scalar cannot express this)\n\n`,
  );

  // Anchor: `gain` is the one free scalar left, set so the disc average lands on
  // the reference's own mean colour under the reference's own luminance.
  const anchorSet = samples.filter(
    (p) => Math.hypot(p.x - POSE.cxN * DISC_PX, p.y - POSE.cyN * DISC_PX) < 0.42 * DISC_PX,
  );
  const meanRatio = (colour: (p: Sample) => Vec3): Vec2 => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (const p of anchorSet) {
      const c = colour(p);
      sumR += toSrgbByte(c[0]);
      sumG += toSrgbByte(c[1]);
      sumB += toSrgbByte(c[2]);
    }
    return [sumG / sumR, sumB / sumR];
  };
  const scaled = (c: Vec3, p: Sample, s: number): Vec3 => [
    p.yTrue * (1 + s * c[0]),
    p.yTrue * (1 + s * c[1]),
    p.yTrue * (1 + s * c[2]),
  ];
  const uniform = sweepScale((s) => meanRatio((p) => scaled(p.cEnhanced, p, s)), 0.05, 1.5);
  const calibrated = sweepScale(
    (k) => meanRatio((p) => scaled(applyMatrix(p.cEnhanced, matrix), p, k)),
    0.3,
    2.0,
  );
  const truth = meanRatio((p) => scaled(p.cTrue, p, 1));
  const raw = meanRatio((p) => scaled(p.cEnhanced, p, 1));
  process.stdout.write(`disc-mean sRGB ratio (r < 0.42w, reference luminance):\n`);
  process.stdout.write(
    `  reference (ground truth)   1 : ${truth[0].toFixed(3)} : ${truth[1].toFixed(3)}\n`,
  );
  process.stdout.write(
    `  enhanced as-is             1 : ${raw[0].toFixed(3)} : ${raw[1].toFixed(3)}\n`,
  );
  process.stdout.write(
    `  uniform scale s = ${uniform.scale.toFixed(3)}     1 : ${uniform.ratio[0].toFixed(3)} : ` +
      `${uniform.ratio[1].toFixed(3)}   residual ${uniform.residual.toFixed(4)}\n`,
  );
  process.stdout.write(
    `  matrix, gain k = ${calibrated.scale.toFixed(3)}      1 : ${calibrated.ratio[0].toFixed(3)} : ` +
      `${calibrated.ratio[1].toFixed(3)}   residual ${calibrated.residual.toFixed(4)}\n\n`,
  );

  const treatment = BODY_TEXTURE_REGISTRY.pluto.treatment;
  if (treatment.kind !== 'panSharpen') {
    throw new Error(`fitPlutoChroma: pluto's treatment is '${treatment.kind}', not 'panSharpen'`);
  }
  const shipped = treatment.calibration;

  process.stdout.write(`per-region mean CIE76 ΔE vs the reference disc (chroma only):\n`);
  process.stdout.write(
    `  region                            n    raw   uniform   fitted   shipped\n`,
  );
  const total = { raw: 0, uniform: 0, matrix: 0, shipped: 0, n: 0 };
  for (const [name, lon0, lon1, lat0, lat1] of REGIONS) {
    const inRegion = samples.filter(
      (p) => p.lon >= lon0 && p.lon <= lon1 && p.lat >= lat0 && p.lat <= lat1,
    );
    if (inRegion.length < 200) {
      process.stdout.write(
        `  ${name.padEnd(30)} ${String(inRegion.length).padStart(5)}  (too few)\n`,
      );
      continue;
    }
    const meanDeltaE = (colour: (p: Sample) => Vec3): number => {
      let sum = 0;
      for (const p of inRegion) {
        const a = lab(scaled(p.cTrue, p, 1));
        const b = lab(colour(p));
        sum += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      }
      return sum / inRegion.length;
    };
    const dRaw = meanDeltaE((p) => scaled(p.cEnhanced, p, 1));
    const dUniform = meanDeltaE((p) => scaled(p.cEnhanced, p, uniform.scale));
    const dMatrix = meanDeltaE((p) =>
      scaled(applyMatrix(p.cEnhanced, matrix), p, calibrated.scale),
    );
    const dShipped = meanDeltaE((p) =>
      scaled(applyMatrix(p.cEnhanced, shipped.matrix), p, shipped.gain),
    );
    total.raw += dRaw;
    total.uniform += dUniform;
    total.matrix += dMatrix;
    total.shipped += dShipped;
    total.n++;
    process.stdout.write(
      `  ${name.padEnd(30)} ${String(inRegion.length).padStart(5)} ${dRaw.toFixed(2).padStart(6)}` +
        `  ${dUniform.toFixed(2).padStart(7)}  ${dMatrix.toFixed(2).padStart(6)}  ${dShipped.toFixed(2).padStart(8)}\n`,
    );
  }
  const meanFitted = total.matrix / total.n;
  const meanShipped = total.shipped / total.n;
  process.stdout.write(
    `  ${'MEAN'.padEnd(30)} ${''.padStart(5)} ${(total.raw / total.n).toFixed(2).padStart(6)}` +
      `  ${(total.uniform / total.n).toFixed(2).padStart(7)}  ${meanFitted.toFixed(2).padStart(6)}` +
      `  ${meanShipped.toFixed(2).padStart(8)}\n\n`,
  );

  const drift = [
    ['matrix[0][0]', matrix[0][0], shipped.matrix[0][0]],
    ['matrix[0][1]', matrix[0][1], shipped.matrix[0][1]],
    ['matrix[1][0]', matrix[1][0], shipped.matrix[1][0]],
    ['matrix[1][1]', matrix[1][1], shipped.matrix[1][1]],
    ['gain', calibrated.scale, shipped.gain],
  ] as const;
  // 5e-4 is half the last shipped digit — the rounding that put those four
  // numbers in the registry. Exceeding it is reported but is NOT the gate: the
  // fit's tile selection keys off image noise, so re-encoding or resizing the
  // reference moves these digits by ~0.002 on its own (measured), and a
  // different rendition of the same NASA image moves them further.
  const rounding = 5e-4;
  process.stdout.write(`vs BODY_TEXTURE_REGISTRY.pluto:\n`);
  let identical = true;
  for (const [name, fitted, registry] of drift) {
    const delta = fitted - registry;
    if (Math.abs(delta) > rounding) identical = false;
    process.stdout.write(
      `  ${name.padEnd(13)} fitted ${fitted.toFixed(4).padStart(8)}   shipped ${registry.toFixed(4).padStart(8)}` +
        `   Δ ${delta.toFixed(4).padStart(8)}${Math.abs(delta) > rounding ? '  *' : ''}\n`,
    );
  }
  process.stdout.write(
    identical
      ? `  reproduced to ${rounding} on this reference.\n`
      : `  * beyond rounding — the shipped constants were fitted on a different rendition.\n`,
  );

  const byteDelta = crossCheckAgainstShippedCode(matrix, calibrated.scale);
  process.stdout.write(`\npanSharpenRgb cross-check: max ${byteDelta} byte(s) apart\n`);

  // The gate is the OUTCOME, not the digits: whatever reference is pinned today,
  // the shipped calibration must still land within half a ΔE of a fresh fit on
  // it (CIE76's just-noticeable difference is ~2.3, so half a unit is invisible)
  // and must still beat the uniform-scale baseline the matrix exists to replace.
  const withinFresh = meanShipped <= meanFitted + 0.5;
  const beatsUniform = meanShipped < total.uniform / total.n;
  const ok = withinFresh && beatsUniform && byteDelta <= 1;
  process.stdout.write(
    `shipped ΔE ${meanShipped.toFixed(2)} vs fresh fit ${meanFitted.toFixed(2)} vs uniform ` +
      `${(total.uniform / total.n).toFixed(2)}\n`,
  );
  process.stdout.write(
    ok
      ? 'VERDICT: the shipped calibration still holds on this reference\n'
      : 'VERDICT: FAILED — the shipped calibration no longer holds; re-fit and update the registry\n',
  );
  return ok;
}

/** `--reference <path>` overrides the pinned raw — the fit is sensitive to which
 *  rendition of the NASA image it sees, and this is how that gets measured. */
function referenceArg(argv: readonly string[]): string | null {
  const at = argv.indexOf('--reference');
  if (at === -1) return null;
  const path = argv[at + 1];
  if (path === undefined) throw new Error('fitPlutoChroma: --reference needs a path');
  return path;
}

async function main(): Promise<void> {
  const ok = await fitPlutoChroma(referenceArg(process.argv.slice(2)));
  if (!ok) process.exit(1);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
