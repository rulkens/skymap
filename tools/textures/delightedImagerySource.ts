/**
 * delightedImagerySource — wrap a photographic `SurfaceImagerySource` (a
 * mosaic with its own baked-in sun) so it reads flat under the renderer's
 * real-time lighting, then apply a `ColourGrade`. Maths and constants are the
 * albedo bench's, landed verbatim (`AlbedoDelight`'s doc comment); a later PR
 * replaces this with a shared implementation. Identity fields are `source`'s.
 *
 * `S` (relief-shading removal) and `B` (low-pass of the delit luminance) are
 * LOW-frequency fields, built ONCE on a whole-globe coarse grid and sampled
 * bilinearly per output pixel — building them per tile would decode the
 * mosaic and MOLA thousands of times over.
 */

import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import type { ColourGrade } from '../../src/@types/scene/ColourGrade';
import { MARS_IAU_SPHERE_RADIUS_M } from '../../src/data/bodies/marsSurfaceParams';
import { gradeRgbaInPlace } from '../utils/image/gradeRgbaInPlace';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import type { AlbedoDelight } from './AlbedoDelight';
import type { HeightSource } from './HeightSource';
import type { SurfaceImagerySource } from './SurfaceImagerySource';

/** The coarse field's level: fine enough to resolve MOLA's own relief, coarse
 *  enough that a whole-globe field is a few million cells, not billions. */
const COARSE_LEVEL = 5;

/** Coarse-luma read chunking: 16x8 boxes of 22.5°, 2x oversampled (512 px)
 *  against the 256-px-per-box coarse grid — a single whole-globe `readBox`
 *  would decode 16 GB, and reading exactly 256 px would alias Viking's much
 *  finer detail into the average instead of properly box-filtering it. */
const LUMA_BOX_COLS = 16;
const LUMA_BOX_ROWS = 8;
const LUMA_BOX_PX = 512;

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Azimuth clockwise from north, as the bench's photographic sun is specified. */
function sunDirection(azDeg: number, elDeg: number): readonly [number, number, number] {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
}

/** A pixel needs no de-lighting work at all when every knob that reads the
 *  coarse field or reshapes luminance is off — matches the bench's own gate. */
function needsDelight(delight: AlbedoDelight): boolean {
  return delight.reliefShade > 0 || delight.flatten > 0 || delight.tame > 0;
}

/** `1 + (lit - 1) * hs` per coarse cell, from MOLA normals at `hex` exaggeration
 *  against the photographic sun — the ratio flat ground would need to read as
 *  it does under that sun, so dividing luminance by it removes the sun's relief. */
async function buildReliefShadeField(
  height: HeightSource,
  delight: AlbedoDelight,
  width: number,
  gridHeight: number,
  stepDeg: number,
): Promise<Float32Array> {
  const posts = await height.readGrid(COARSE_LEVEL, 0, 0, width + 1, gridHeight + 1);
  if (posts === null) {
    throw new Error('delightedImagerySource: height source has no coverage at the coarse level');
  }
  const postsPerRow = width + 1;
  const cellHeight = new Float32Array(width * gridHeight);
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < width; i++) {
      cellHeight[j * width + i] =
        (posts[j * postsPerRow + i]! +
          posts[j * postsPerRow + i + 1]! +
          posts[(j + 1) * postsPerRow + i]! +
          posts[(j + 1) * postsPerRow + i + 1]!) /
        4;
    }
  }

  const dy = MARS_IAU_SPHERE_RADIUS_M * ((stepDeg * Math.PI) / 180);
  const light = sunDirection(delight.photoSunAzDeg, delight.photoSunElDeg);
  const hex = delight.reliefExaggeration;
  const hs = delight.reliefShade;
  const field = new Float32Array(width * gridHeight);
  for (let j = 0; j < gridHeight; j++) {
    const lat = 90 - (j + 0.5) * stepDeg;
    const dx = Math.max(dy * Math.cos((lat * Math.PI) / 180), dy * 0.02);
    const north = Math.max(0, j - 1);
    const south = Math.min(gridHeight - 1, j + 1);
    const dyEffective = (south - north) * dy;
    for (let i = 0; i < width; i++) {
      const west = wrap(i - 1, width);
      const east = wrap(i + 1, width);
      const gx = ((cellHeight[j * width + east]! - cellHeight[j * width + west]!) / (2 * dx)) * hex;
      const gy =
        ((cellHeight[north * width + i]! - cellHeight[south * width + i]!) / dyEffective) * hex;
      const inv = 1 / Math.hypot(gx, gy, 1);
      const nx = -gx * inv;
      const ny = -gy * inv;
      const nz = inv;
      const lit = Math.max(0.15, (nx * light[0] + ny * light[1] + nz * light[2]) / light[2]);
      field[j * width + i] = 1 + (lit - 1) * hs;
    }
  }
  return field;
}

/** Rec.709 luma of `source`, box-averaged 2x2 from a 2x-oversampled read into
 *  the coarse grid's own resolution. */
async function buildCoarseLuma(
  source: SurfaceImagerySource,
  width: number,
  gridHeight: number,
): Promise<Float32Array> {
  const boxDeg = 360 / LUMA_BOX_COLS;
  const cellsPerBoxX = width / LUMA_BOX_COLS;
  const cellsPerBoxY = gridHeight / LUMA_BOX_ROWS;
  const luma = new Float32Array(width * gridHeight);
  for (let by = 0; by < LUMA_BOX_ROWS; by++) {
    const north = 90 - by * boxDeg;
    const south = north - boxDeg;
    for (let bx = 0; bx < LUMA_BOX_COLS; bx++) {
      const west = -180 + bx * boxDeg;
      const box: LonLatBounds = { west, east: west + boxDeg, south, north };
      const raster = await source.readBox(box, LUMA_BOX_PX, LUMA_BOX_PX);
      if (raster === null) continue;
      for (let y = 0; y < cellsPerBoxY; y++) {
        for (let x = 0; x < cellsPerBoxX; x++) {
          let sum = 0;
          for (let sy = 0; sy < 2; sy++) {
            for (let sx = 0; sx < 2; sx++) {
              const i = ((y * 2 + sy) * LUMA_BOX_PX + (x * 2 + sx)) * 4;
              sum += LUMA_R * raster[i]! + LUMA_G * raster[i + 1]! + LUMA_B * raster[i + 2]!;
            }
          }
          const destX = bx * cellsPerBoxX + x;
          const destY = by * cellsPerBoxY + y;
          luma[destY * width + destX] = Math.max(1e-3, sum / 4 / 255);
        }
      }
    }
  }
  return luma;
}

/** Separable box blur, run twice (close to a Gaussian), wrapping horizontally
 *  (the globe has no east/west edge) and clamping vertically (it does have
 *  poles). */
function blurWrapHorizontal(
  src: Float32Array,
  width: number,
  height: number,
  r: number,
): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const afterX = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + wrap(x, width)]!;
      for (let x = 0; x < width; x++) {
        afterX[row + x] = acc / (2 * r + 1);
        acc += a[row + wrap(x + r + 1, width)]! - a[row + wrap(x - r, width)]!;
      }
    }
    const afterY = new Float32Array(width * height);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++)
        acc += afterX[Math.min(height - 1, Math.max(0, y)) * width + x]!;
      for (let y = 0; y < height; y++) {
        afterY[y * width + x] = acc / (2 * r + 1);
        acc +=
          afterX[Math.min(height - 1, y + r + 1) * width + x]! -
          afterX[Math.max(0, y - r) * width + x]!;
      }
    }
    a = afterY;
  }
  return a;
}

type CoarseFields = {
  readonly width: number;
  readonly height: number;
  readonly relightRatio: Float32Array;
  readonly lowPass: Float32Array;
};

async function buildCoarseFields(
  source: SurfaceImagerySource,
  height: HeightSource,
  delight: AlbedoDelight,
): Promise<CoarseFields> {
  const stepDeg = heightLatticeStepDeg(COARSE_LEVEL);
  const width = Math.round(360 / stepDeg);
  const gridHeight = Math.round(180 / stepDeg);
  const relightRatio =
    delight.reliefShade > 0
      ? await buildReliefShadeField(height, delight, width, gridHeight, stepDeg)
      : new Float32Array(width * gridHeight).fill(1);
  let lowPass: Float32Array = new Float32Array(0);
  if (delight.flatten > 0) {
    const luma = await buildCoarseLuma(source, width, gridHeight);
    const relit = new Float32Array(width * gridHeight);
    for (let i = 0; i < relit.length; i++) relit[i] = luma[i]! / relightRatio[i]!;
    const radiusPx = Math.max(1, Math.round(delight.flattenRadiusDeg / stepDeg));
    lowPass = blurWrapHorizontal(relit, width, gridHeight, radiusPx);
  }
  return { width, height: gridHeight, relightRatio, lowPass };
}

/** Bilinear sample of a coarse field at `lon`/`lat`, wrapping east/west and
 *  clamping north/south — the same convention the field was built on. */
function sampleCoarse(
  field: Float32Array,
  width: number,
  height: number,
  lon: number,
  lat: number,
): number {
  const stepX = 360 / width;
  const stepY = 180 / height;
  const fx = (lon + 180) / stepX - 0.5;
  const fy = (90 - lat) / stepY - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xw0 = wrap(x0, width);
  const xw1 = wrap(x0 + 1, width);
  const yc0 = Math.min(height - 1, Math.max(0, y0));
  const yc1 = Math.min(height - 1, Math.max(0, y0 + 1));
  const v00 = field[yc0 * width + xw0]!;
  const v10 = field[yc0 * width + xw1]!;
  const v01 = field[yc1 * width + xw0]!;
  const v11 = field[yc1 * width + xw1]!;
  return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
}

export function delightedImagerySource(
  source: SurfaceImagerySource,
  height: HeightSource,
  delight: AlbedoDelight,
  grade: ColourGrade,
): SurfaceImagerySource {
  let fields: Promise<CoarseFields> | undefined;

  return {
    id: source.id,
    attribution: source.attribution,
    maxLevel: source.maxLevel,
    coverage: source.coverage,
    provenance: source.provenance,

    async readBox(box, widthPx, heightPx) {
      const raster = await source.readBox(box, widthPx, heightPx);
      if (raster === null) return null;
      const out = new Uint8Array(raster);

      if (needsDelight(delight)) {
        fields ??= buildCoarseFields(source, height, delight);
        const { width, height: fieldHeight, relightRatio, lowPass } = await fields;
        const span = Math.max(1e-3, 1 - delight.knee);
        for (let py = 0; py < heightPx; py++) {
          const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
          const polar = smoothstep(50, 60, Math.abs(lat));
          for (let px = 0; px < widthPx; px++) {
            const i = (py * widthPx + px) * 4;
            if (out[i + 3] === 0) continue;
            const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
            const r0 = out[i]!;
            const g0 = out[i + 1]!;
            const b0 = out[i + 2]!;
            const y = Math.max(1e-3, (LUMA_R * r0 + LUMA_G * g0 + LUMA_B * b0) / 255);
            const s = sampleCoarse(relightRatio, width, fieldHeight, lon, lat);
            const y1 = y / s;
            let y2 = y1;
            if (delight.flatten > 0) {
              const b = sampleCoarse(lowPass, width, fieldHeight, lon, lat);
              y2 = b * (y1 / b) ** (1 - delight.flatten);
            }
            if (delight.tame > 0 && y2 > delight.knee) {
              y2 =
                delight.knee +
                (y2 - delight.knee) / (1 + (delight.tame * 4 * (y2 - delight.knee)) / span);
            }
            let q = y2 / y;
            if (polar > 0 && delight.keepIce > 0) {
              const max = Math.max(r0, g0, b0);
              const min = Math.min(r0, g0, b0);
              const white = smoothstep(0.55, 0.8, min / Math.max(1, max)) * smoothstep(0.3, 0.5, y);
              q += (1 - q) * white * polar * delight.keepIce;
            }
            out[i] = Math.round(Math.min(255, Math.max(0, r0 * q)));
            out[i + 1] = Math.round(Math.min(255, Math.max(0, g0 * q)));
            out[i + 2] = Math.round(Math.min(255, Math.max(0, b0 * q)));
          }
        }
      }

      gradeRgbaInPlace(out, grade);
      return out;
    },
  };
}
