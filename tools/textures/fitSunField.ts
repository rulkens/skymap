/**
 * fitSunField — the shading-direction field over a region (design §6):
 * least-squares windows on a physically-uniform sphere lattice feed a
 * Gaussian-weighted fill on a separate, plain equirect output raster. Reads
 * `region` grown by margin so a window near the caller's edge still has the
 * fill's full support — "regional equals global" (R-P2) depends on every
 * fitted window a cell can see existing in both fits, which only holds if
 * the grid is anchored globally rather than shifted per-region.
 */
import type { HeightSource } from './HeightSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import type { AlbedoRecipe } from './AlbedoRecipe';
import { SURFACE_EQUIRECT_BASE_WIDTH_PX } from '../../src/data/bodies/surfaceTileParams';
import { gaussianBlurFloat32 } from '../utils/image/gaussianBlurFloat32';
import { fitShadingGradient } from '../utils/textures/fitShadingGradient';
import { sampleSlope } from '../utils/textures/sampleSlope';
import { readSlopeLattice } from './readSlopeLattice';
import type { SunField } from './SunField';
import type { SurfaceImagerySource } from './SurfaceImagerySource';

export const FIT_CANVAS_LEVEL = 5;

const DEG_TO_RAD = Math.PI / 180;
const CANVAS_WIDTH_PX = SURFACE_EQUIRECT_BASE_WIDTH_PX << FIT_CANVAS_LEVEL;
const DEG_PER_PX = 360 / CANVAS_WIDTH_PX;

// Regularises the fill toward g=0 (no correction) rather than trusting one
// nearby low-weight window; small next to the several-window sums a
// reasonable stride/fillSigma ratio produces, per the design's "shrinks to 0
// where evidence is sparse instead of extrapolating".
const PRIOR_WEIGHT = 0.25;
const CONFIDENCE_EPS = 1e-6;

const kmToDeg = (km: number, radiusM: number): number => ((km * 1000) / radiusM) * (180 / Math.PI);

// sRGB decode only — until Task 5 lands the shared tools/utils/color version,
// duplicating one 2-line formula is cheaper than a premature cross-task import.
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function greatCircleDistanceKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
  radiusM: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * radiusM) / 1000;
}

function growRegion(region: LonLatBounds, marginKm: number, radiusM: number): LonLatBounds {
  const marginLatDeg = kmToDeg(marginKm, radiusM);
  const north = Math.min(90, region.north + marginLatDeg);
  const south = Math.max(-90, region.south - marginLatDeg);
  const maxAbsLat = Math.min(89, Math.max(Math.abs(north), Math.abs(south)));
  const marginLonDeg = marginLatDeg / Math.cos(maxAbsLat * DEG_TO_RAD);
  return {
    west: Math.max(-180, region.west - marginLonDeg),
    east: Math.min(180, region.east + marginLonDeg),
    south,
    north,
  };
}

type FittedWindow = {
  readonly lon: number;
  readonly lat: number;
  readonly gx: number;
  readonly gy: number;
  readonly confidence: number;
};

export async function fitSunField(opts: {
  readonly imagery: SurfaceImagerySource;
  readonly height: HeightSource;
  readonly region: LonLatBounds;
  readonly sunFit: AlbedoRecipe['sunFit'];
  readonly radiusM: number;
}): Promise<SunField> {
  const { imagery, height, region, sunFit, radiusM } = opts;
  const { windowKm, strideKm, highPassKm, minConfidence, fillSigmaKm } = sunFit;

  const grown = growRegion(region, 3 * fillSigmaKm + windowKm, radiusM);
  const latStepDeg = kmToDeg(strideKm, radiusM);
  const halfWindowLatDeg = kmToDeg(windowKm / 2, radiusM);
  const halfBandLatDeg = kmToDeg((windowKm + strideKm) / 2, radiusM);
  const sigmaPx = kmToDeg(highPassKm, radiusM) / DEG_PER_PX;

  const windows: FittedWindow[] = [];
  const kMin = Math.ceil(Math.max(grown.south, -88) / latStepDeg);
  const kMax = Math.floor(Math.min(grown.north, 88) / latStepDeg);

  for (let k = kMin; k <= kMax; k++) {
    const latDeg = k * latStepDeg;
    if (Math.abs(latDeg) > 88) continue;
    const lonStepDeg = latStepDeg / Math.cos(latDeg * DEG_TO_RAD);
    const mMin = Math.ceil((grown.west + 180) / lonStepDeg);
    const mMax = Math.floor((grown.east + 180) / lonStepDeg);
    if (mMax < mMin) continue;

    // Snapped to the GLOBAL canvas pixel grid (floor/ceil, not a divide of
    // this run's own box width by a rounded pixel count): two runs whose
    // bands differ in extent must still put "pixel px" at the exact same
    // lon/lat, or the regional/global equality test drifts by a rounding
    // remainder — see fillOutputGrid's own comment for the same reasoning.
    const rawBand = {
      west: grown.west,
      east: grown.east,
      south: Math.max(-90, latDeg - halfBandLatDeg),
      north: Math.min(90, latDeg + halfBandLatDeg),
    };
    const colFrom = Math.floor((rawBand.west + 180) / DEG_PER_PX);
    const colTo = Math.max(colFrom, Math.ceil((rawBand.east + 180) / DEG_PER_PX) - 1);
    const rowFrom = Math.floor((90 - rawBand.north) / DEG_PER_PX);
    const rowTo = Math.max(rowFrom, Math.ceil((90 - rawBand.south) / DEG_PER_PX) - 1);
    const widthPx = colTo - colFrom + 1;
    const heightPx = rowTo - rowFrom + 1;
    const bandBox: LonLatBounds = {
      west: -180 + colFrom * DEG_PER_PX,
      east: -180 + (colTo + 1) * DEG_PER_PX,
      north: 90 - rowFrom * DEG_PER_PX,
      south: 90 - (rowTo + 1) * DEG_PER_PX,
    };
    const raster = await imagery.readBox(bandBox, widthPx, heightPx);
    if (raster === null) continue;

    const slopeLattice = await readSlopeLattice(height, bandBox, radiusM);
    const y = new Float32Array(widthPx * heightPx);
    const sx = new Float32Array(widthPx * heightPx);
    const sy = new Float32Array(widthPx * heightPx);
    const alpha = new Float32Array(widthPx * heightPx);
    for (let py = 0; py < heightPx; py++) {
      const lat = bandBox.north - ((py + 0.5) / heightPx) * (bandBox.north - bandBox.south);
      for (let px = 0; px < widthPx; px++) {
        const lon = bandBox.west + ((px + 0.5) / widthPx) * (bandBox.east - bandBox.west);
        const i = py * widthPx + px;
        const r = srgbToLinear(raster[i * 4]! / 255);
        const g = srgbToLinear(raster[i * 4 + 1]! / 255);
        const b = srgbToLinear(raster[i * 4 + 2]! / 255);
        y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        alpha[i] = raster[i * 4 + 3]! / 255;
        const [slopeX, slopeY] = sampleSlope(slopeLattice, lon, lat);
        sx[i] = slopeX;
        sy[i] = slopeY;
      }
    }
    // High-pass removes regional albedo trends that would otherwise
    // correlate with regional tilt; scaling y and s by the same constant
    // (the window's mean y) leaves a homogeneous least-squares fit
    // unchanged, so only y needs the divide-through below.
    const yHigh = subtractBlur(y, widthPx, heightPx, sigmaPx);
    const sxHigh = subtractBlur(sx, widthPx, heightPx, sigmaPx);
    const syHigh = subtractBlur(sy, widthPx, heightPx, sigmaPx);

    for (let m = mMin; m <= mMax; m++) {
      const lonDeg = -180 + m * lonStepDeg;
      const halfLonDeg = halfWindowLatDeg / Math.cos(latDeg * DEG_TO_RAD);
      const windowBox = {
        west: lonDeg - halfLonDeg,
        east: lonDeg + halfLonDeg,
        south: latDeg - halfWindowLatDeg,
        north: latDeg + halfWindowLatDeg,
      };
      const x0 = clampIndex(Math.round((windowBox.west - bandBox.west) / DEG_PER_PX), widthPx);
      const x1 = clampIndex(Math.round((windowBox.east - bandBox.west) / DEG_PER_PX), widthPx);
      const y0 = clampIndex(Math.round((bandBox.north - windowBox.north) / DEG_PER_PX), heightPx);
      const y1 = clampIndex(Math.round((bandBox.north - windowBox.south) / DEG_PER_PX), heightPx);
      const nx = x1 - x0 + 1;
      const ny = y1 - y0 + 1;
      if (nx <= 1 || ny <= 1) continue;

      const n = nx * ny;
      const yWin = new Float32Array(n);
      const sxWin = new Float32Array(n);
      const syWin = new Float32Array(n);
      const wWin = new Float32Array(n);
      let sumW = 0;
      let sumWY = 0;
      for (let jy = 0; jy < ny; jy++) {
        for (let jx = 0; jx < nx; jx++) {
          const src = (y0 + jy) * widthPx + (x0 + jx);
          const dst = jy * nx + jx;
          wWin[dst] = alpha[src]!;
          sumW += alpha[src]!;
          sumWY += alpha[src]! * y[src]!;
          yWin[dst] = yHigh[src]!;
          sxWin[dst] = sxHigh[src]!;
          syWin[dst] = syHigh[src]!;
        }
      }
      if (sumW <= 0) continue;
      const meanY = sumWY / sumW;
      if (!(meanY > 0)) continue;
      for (let i = 0; i < n; i++) yWin[i] = yWin[i]! / meanY;

      const fit = fitShadingGradient(yWin, sxWin, syWin, wWin);
      windows.push({
        lon: lonDeg,
        lat: latDeg,
        gx: fit.gx,
        gy: fit.gy,
        confidence: fit.confidence,
      });
    }
  }

  return fillOutputGrid(region, sunFit, windows, minConfidence, radiusM);
}

function subtractBlur(
  values: Float32Array,
  width: number,
  height: number,
  sigmaPx: number,
): Float32Array {
  const blurred = gaussianBlurFloat32(values, width, height, sigmaPx);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! - blurred[i]!;
  return out;
}

function clampIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

// The output raster shares its origin with every other global lattice in
// this codebase (heightLatticeBounds, SlopeLattice): post `(i, j)` at
// `lon = -180 + i·stepDeg`, so two calls covering overlapping regions land
// their shared cells on identical lon/lat, not merely close ones.
function fillOutputGrid(
  region: LonLatBounds,
  sunFit: AlbedoRecipe['sunFit'],
  windows: readonly FittedWindow[],
  minConfidence: number,
  radiusM: number,
): SunField {
  const stepDeg = kmToDeg(sunFit.strideKm / 2, radiusM);
  const iMin = Math.floor((region.west + 180) / stepDeg);
  const iMax = Math.ceil((region.east + 180) / stepDeg);
  const jMin = Math.floor((90 - region.north) / stepDeg);
  const jMax = Math.ceil((90 - region.south) / stepDeg);
  const width = iMax - iMin + 1;
  const height = jMax - jMin + 1;
  const bounds: LonLatBounds = {
    west: -180 + iMin * stepDeg,
    east: -180 + iMax * stepDeg,
    north: 90 - jMin * stepDeg,
    south: 90 - jMax * stepDeg,
  };

  const passing = windows.filter((w) => w.confidence >= minConfidence);
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const confidence = new Float32Array(width * height);
  const sigmaKm = sunFit.fillSigmaKm;

  for (let j = 0; j < height; j++) {
    const lat = 90 - (jMin + j) * stepDeg;
    for (let i = 0; i < width; i++) {
      const lon = -180 + (iMin + i) * stepDeg;
      let sumWC = 0;
      let sumWCGx = 0;
      let sumWCGy = 0;
      let sumW = 0;
      for (const w of passing) {
        const d = greatCircleDistanceKm(lon, lat, w.lon, w.lat, radiusM);
        const weight = Math.exp(-(d * d) / (2 * sigmaKm * sigmaKm));
        sumW += weight;
        sumWC += weight * w.confidence;
        sumWCGx += weight * w.confidence * w.gx;
        sumWCGy += weight * w.confidence * w.gy;
      }
      const cell = j * width + i;
      gx[cell] = sumWCGx / (sumWC + PRIOR_WEIGHT);
      gy[cell] = sumWCGy / (sumWC + PRIOR_WEIGHT);
      confidence[cell] = sumWC / (sumW + CONFIDENCE_EPS);
    }
  }
  return { bounds, width, height, gx, gy, confidence, radiusM };
}
