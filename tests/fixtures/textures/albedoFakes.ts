/**
 * albedoFakes — an analytic Mars-scale terrain (design §4): a height field
 * with a known wavelength/amplitude, and an imagery source lit by `(1+g·s)`
 * where `s` is that SAME height's `readSlopeLattice` slope — not an
 * independently-derived formula, so a fit test isolates `fitSunField`'s own
 * windowing and regression rather than also absorbing the central
 * difference's own discretisation error as fit noise (that error is
 * `readSlopeLattice`'s own test's job, not this one's).
 */
import type { HeightSource } from '../../../tools/textures/HeightSource';
import type { SurfaceImagerySource } from '../../../tools/textures/SurfaceImagerySource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';
import { sampleSlope } from '../../../tools/utils/textures/sampleSlope';
import { readSlopeLattice } from '../../../tools/textures/readSlopeLattice';

const DEG_TO_RAD = Math.PI / 180;

// Additive (not product) sinusoids, ~15 km wavelength at Mars's radius —
// several cycles per test window, for a non-degenerate slope fit. A large
// amplitude (~35% max slope) keeps the g-driven shading well above 8-bit
// sRGB quantization noise, which otherwise swamps a gentler signal.
const AMPLITUDE_M = 800;
const CYCLES_PER_REVOLUTION = 1420;

function heightAt(lon: number, lat: number): number {
  return (
    AMPLITUDE_M * Math.sin(CYCLES_PER_REVOLUTION * lon * DEG_TO_RAD) +
    AMPLITUDE_M * Math.sin(CYCLES_PER_REVOLUTION * lat * DEG_TO_RAD)
  );
}

function linearToSrgb(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const WHOLE_GLOBE = [{ west: -180, east: 180, south: -90, north: 90 }] as const;

export function analyticHeightSource(): HeightSource {
  return {
    id: 'analytic-fake-height',
    attribution: 'test',
    maxLevel: 12,
    coverage: WHOLE_GLOBE,
    provenance: { sourceId: 'analytic-fake-height', attribution: 'test', vintage: '2026' },
    async readGrid(z, i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      const grid = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const lat = 90 - (j0 + j) * step;
        for (let i = 0; i < nx; i++) grid[j * nx + i] = heightAt(-180 + (i0 + i) * step, lat);
      }
      return grid;
    },
    async boundsInBox() {
      return [-2 * AMPLITUDE_M, 2 * AMPLITUDE_M];
    },
  };
}

/** Constant linear albedo lit by `(1 + g·s)`, `s` read from `height` itself:
 *  the only thing a fit over this source can recover is `g`. */
export function analyticImagerySource(
  height: HeightSource,
  albedo: readonly [number, number, number],
  g: readonly [number, number],
): SurfaceImagerySource {
  return {
    id: 'analytic-fake-imagery',
    attribution: 'test',
    maxLevel: 12,
    coverage: WHOLE_GLOBE,
    provenance: { sourceId: 'analytic-fake-imagery', attribution: 'test', vintage: '2026' },
    async readBox(box, widthPx, heightPx) {
      const lattice = await readSlopeLattice(height, box);
      const out = new Uint8Array(widthPx * heightPx * 4);
      for (let py = 0; py < heightPx; py++) {
        const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
        for (let px = 0; px < widthPx; px++) {
          const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
          const [sx, sy] = sampleSlope(lattice, lon, lat);
          const shade = Math.max(0, 1 + g[0] * sx + g[1] * sy);
          const i = (py * widthPx + px) * 4;
          out[i] = Math.round(255 * linearToSrgb(albedo[0] * shade));
          out[i + 1] = Math.round(255 * linearToSrgb(albedo[1] * shade));
          out[i + 2] = Math.round(255 * linearToSrgb(albedo[2] * shade));
          out[i + 3] = 255;
        }
      }
      return out;
    },
  };
}
