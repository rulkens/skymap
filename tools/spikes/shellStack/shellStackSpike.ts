/**
 * shellStackSpike — CPU spike for the "spherical shell stack" volume representation
 * (a multi-sphere image baked from a density cube). Everything runs in Node so the
 * question "does the representation hold up, and at what byte cost?" gets answered
 * without a GPU; frame-time stays a Mac question. One deliberately duplicated transfer
 * function (mirrors scalarVolume/fragment.wesl, minus jitter and exposure) feeds three
 * renderers of the same camera: a 1024-step truth march, the shader's own 128-step
 * march, and the shell composite. Errors are vs truth. See README.md beside this file.
 *
 * Usage: tsx tools/spikes/shellStack/shellStackSpike.ts <mcpm_sdss_d4.npy> --out <dir>
 *        [--centre cube|observer] [--shells 64] [--res 512] [--power 1]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { buildPaletteLut } from '../../../src/data/volume/scalarFieldPalettes';
import { readNpy } from '../../parsers/npyReader';
import {
  MCPM_BASE_DIMS,
  MCPM_BASE_VOXEL_EDGE_MPC,
  MCPM_GRID_CENTER_MPC,
} from '../../volumes/buildMcpmVolume';

type Vec3 = [number, number, number];
type Cube = { values: Float32Array; dims: Vec3; centre: Vec3; halfExtent: Vec3; voxelMpc: number };
/** Per texel: band alpha (u8) and alpha-weighted mean palette coordinate (u8). */
type Shell = { res: number; data: Uint8Array };
type Stack = { centre: Vec3; radii: Float64Array; shells: Shell[] };
type Camera = { eye: Vec3; target: Vec3; fovDeg: number };
type Image = { w: number; h: number; rgb: Float32Array; fetches: number };

// MCPM_ENTRY's look knobs, so the pictures are the shipped look, not a lab one.
const CONTRAST = 1.7;
const TRIM = 0.3;
const DENSITY_SCALE = 18.0;
const ENVELOPE_INNER = 0.85;
const ENVELOPE_OUTER = 1.05;
const LUT = buildPaletteLut('inferno');
const LUT_SIZE = LUT.length / 4;
const IMAGE_SIZE = 384;
// The shader's stepLength is in local [0,1] units; one world Mpc is this many of them (the
// cube is not cubic, so this is the long axis, which is close enough for a spike).
let LOCAL_PER_MPC = 1;

function loadCube(path: string): Cube {
  const buf = readFileSync(path);
  const npy = readNpy(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const values = new Float32Array(npy.values.length);
  let max = 0;
  for (let i = 0; i < values.length; i++) if (npy.values[i]! > max) max = npy.values[i]!;
  const inv = 1 / Math.log1p(max);
  for (let i = 0; i < values.length; i++) values[i] = Math.log1p(Math.max(0, npy.values[i]!)) * inv;
  const dims: Vec3 = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];
  const factor = MCPM_BASE_DIMS[0] / dims[0];
  const voxelMpc = MCPM_BASE_VOXEL_EDGE_MPC * factor;
  const halfExtent: Vec3 = [
    dims[0] * voxelMpc * 0.5,
    dims[1] * voxelMpc * 0.5,
    dims[2] * voxelMpc * 0.5,
  ];
  LOCAL_PER_MPC = 1 / (2 * Math.max(...halfExtent));
  return { values, dims, centre: [...MCPM_GRID_CENTER_MPC] as Vec3, halfExtent, voxelMpc };
}

/** Trilinear sample at world Mpc (clamped to the edge like the GPU sampler). */
function sampleCube(cube: Cube, wx: number, wy: number, wz: number): number {
  const [n0, n1, n2] = cube.dims;
  const fx = Math.min(
    Math.max((((wx - cube.centre[0]) / cube.halfExtent[0]) * 0.5 + 0.5) * n0 - 0.5, 0),
    n0 - 1,
  );
  const fy = Math.min(
    Math.max((((wy - cube.centre[1]) / cube.halfExtent[1]) * 0.5 + 0.5) * n1 - 0.5, 0),
    n1 - 1,
  );
  const fz = Math.min(
    Math.max((((wz - cube.centre[2]) / cube.halfExtent[2]) * 0.5 + 0.5) * n2 - 0.5, 0),
    n2 - 1,
  );
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy),
    z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, n0 - 1),
    y1 = Math.min(y0 + 1, n1 - 1),
    z1 = Math.min(z0 + 1, n2 - 1);
  const tx = fx - x0,
    ty = fy - y0,
    tz = fz - z0;
  const v = cube.values;
  const s = (i: number, j: number, k: number) => v[(i * n1 + j) * n2 + k]!;
  const c00 = s(x0, y0, z0) * (1 - tz) + s(x0, y0, z1) * tz;
  const c01 = s(x0, y1, z0) * (1 - tz) + s(x0, y1, z1) * tz;
  const c10 = s(x1, y0, z0) * (1 - tz) + s(x1, y0, z1) * tz;
  const c11 = s(x1, y1, z0) * (1 - tz) + s(x1, y1, z1) * tz;
  return (c00 * (1 - ty) + c01 * ty) * (1 - tx) + (c10 * (1 - ty) + c11 * ty) * tx;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function insideCube(cube: Cube, wx: number, wy: number, wz: number): boolean {
  return (
    Math.abs(wx - cube.centre[0]) <= cube.halfExtent[0] &&
    Math.abs(wy - cube.centre[1]) <= cube.halfExtent[1] &&
    Math.abs(wz - cube.centre[2]) <= cube.halfExtent[2]
  );
}

/** One march step at world Mpc: (palette coordinate, alpha) for a step of `stepMpc`. */
function windowSample(
  cube: Cube,
  wx: number,
  wy: number,
  wz: number,
  stepMpc: number,
  out: Float32Array,
): void {
  if (!insideCube(cube, wx, wy, wz)) {
    out[0] = 0;
    out[1] = 0;
    return;
  }
  const v = sampleCube(cube, wx, wy, wz);
  const deadband = Math.max(Math.min(Math.max(1 - 1 / CONTRAST, 0), 0.9), Math.min(TRIM, 0.95));
  const stretched = Math.min(Math.max((v - deadband) / (1 - deadband), 0), 1);
  const visibility = smoothstep(deadband - 0.05, deadband + 0.05, v);
  const lx = (wx - cube.centre[0]) / cube.halfExtent[0];
  const ly = (wy - cube.centre[1]) / cube.halfExtent[1];
  const lz = (wz - cube.centre[2]) / cube.halfExtent[2];
  const envelope = 1 - smoothstep(ENVELOPE_INNER, ENVELOPE_OUTER, Math.hypot(lx, ly, lz));
  const li = Math.min(LUT_SIZE - 1, Math.round(stretched * (LUT_SIZE - 1))) * 4;
  const lutA = LUT[li + 3]! / 255;
  out[0] = stretched;
  out[1] = Math.min(1, lutA * DENSITY_SCALE * stepMpc * LOCAL_PER_MPC * visibility * envelope);
}

function lutRgb(t: number, out: Float32Array): void {
  const li = Math.min(LUT_SIZE - 1, Math.round(t * (LUT_SIZE - 1))) * 4;
  out[0] = LUT[li]! / 255;
  out[1] = LUT[li + 1]! / 255;
  out[2] = LUT[li + 2]! / 255;
}

// --- octahedral map ---------------------------------------------------------------

function octEncode(x: number, y: number, z: number): [number, number] {
  const n = Math.abs(x) + Math.abs(y) + Math.abs(z);
  let px = x / n,
    py = y / n;
  if (z < 0) {
    const ox = (1 - Math.abs(py)) * (px >= 0 ? 1 : -1);
    const oy = (1 - Math.abs(px)) * (py >= 0 ? 1 : -1);
    px = ox;
    py = oy;
  }
  return [px * 0.5 + 0.5, py * 0.5 + 0.5];
}

function octDecode(u: number, v: number): Vec3 {
  let x = u * 2 - 1,
    y = v * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
    const oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    x = ox;
    y = oy;
  }
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

// --- bake -------------------------------------------------------------------------

/**
 * Observer-centred: shells around the Milky Way at the origin, spanning the cube's radial
 * extent, angular resolution per shell matched to one voxel at that radius (a true LOD,
 * since the home view is radial). Cube-centred: shells around the cube, full angular
 * resolution everywhere, since an inside camera looks at inner shells up close.
 */
function bakeStack(
  cube: Cube,
  mode: 'cube' | 'observer',
  count: number,
  outerRes: number,
  power: number,
): Stack {
  const centre: Vec3 = mode === 'cube' ? cube.centre : [0, 0, 0];
  let rLo = 0,
    rHi = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const d = Math.hypot(
          cube.centre[0] + sx * cube.halfExtent[0] - centre[0],
          cube.centre[1] + sy * cube.halfExtent[1] - centre[1],
          cube.centre[2] + sz * cube.halfExtent[2] - centre[2],
        );
        rHi = Math.max(rHi, d);
      }
  if (mode === 'observer') {
    // Nearest point of the box to the origin.
    const q = cube.centre.map((c, i) => Math.max(0, Math.abs(c) - cube.halfExtent[i]!));
    rLo = Math.hypot(q[0]!, q[1]!, q[2]!);
  }
  const radii = new Float64Array(count + 1);
  for (let k = 0; k <= count; k++) radii[k] = rLo + (rHi - rLo) * Math.pow(k / count, power);
  const shells: Shell[] = [];
  const s = new Float32Array(2);
  for (let k = 0; k < count; k++) {
    const rIn = radii[k]!,
      rOut = radii[k + 1]!;
    const res =
      mode === 'observer'
        ? Math.max(16, Math.min(outerRes, Math.ceil((outerRes * rOut) / rHi / 8) * 8))
        : outerRes;
    const steps = Math.max(4, Math.ceil(((rOut - rIn) / cube.voxelMpc) * 2));
    const dr = (rOut - rIn) / steps;
    const data = new Uint8Array(res * res * 2);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const [dx, dy, dz] = octDecode((i + 0.5) / res, (j + 0.5) / res);
        let aA = 0,
          tSum = 0,
          wSum = 0;
        for (let st = 0; st < steps; st++) {
          const r = rOut - (st + 0.5) * dr;
          windowSample(cube, centre[0] + dx * r, centre[1] + dy * r, centre[2] + dz * r, dr, s);
          const w = (1 - aA) * s[1]!;
          aA += w;
          tSum += w * s[0]!;
          wSum += w;
        }
        const o = (j * res + i) * 2;
        data[o] = Math.round(aA * 255);
        data[o + 1] = Math.round((wSum > 0 ? tSum / wSum : 0) * 255);
      }
    }
    shells.push({ res, data });
  }
  return { centre, radii, shells };
}

function stackBytes(stack: Stack): number {
  return stack.shells.reduce((n, s) => n + s.data.length, 0);
}

function sampleShell(shell: Shell, u: number, v: number, out: Float32Array): void {
  const fx = Math.min(Math.max(u * shell.res - 0.5, 0), shell.res - 1);
  const fy = Math.min(Math.max(v * shell.res - 0.5, 0), shell.res - 1);
  const x0 = Math.floor(fx),
    y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, shell.res - 1),
    y1 = Math.min(y0 + 1, shell.res - 1);
  const tx = fx - x0,
    ty = fy - y0;
  for (let ch = 0; ch < 2; ch++) {
    const p = (x: number, y: number) => shell.data[(y * shell.res + x) * 2 + ch]! / 255;
    out[ch] =
      (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) +
      (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty;
  }
}

// --- renderers --------------------------------------------------------------------

function rayDir(cam: Camera, px: number, py: number): Vec3 {
  const [ex, ey, ez] = cam.eye;
  let fx = cam.target[0] - ex,
    fy = cam.target[1] - ey,
    fz = cam.target[2] - ez;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz,
    ry = 0,
    rz = fx;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * fz - rz * fy,
    uy = rz * fx - rx * fz,
    uz = rx * fy - ry * fx;
  const s = Math.tan((cam.fovDeg * Math.PI) / 360);
  const a = (((px + 0.5) / IMAGE_SIZE) * 2 - 1) * s;
  const b = (1 - ((py + 0.5) / IMAGE_SIZE) * 2) * s;
  const dx = fx + a * rx + b * ux,
    dy = fy + a * ry + b * uy,
    dz = fz + a * rz + b * uz;
  const dl = Math.hypot(dx, dy, dz);
  return [dx / dl, dy / dl, dz / dl];
}

/** Slab test against the cube's world AABB; tMin clamped to 0 for an inside eye. */
function intersectCube(cube: Cube, o: Vec3, d: Vec3): [number, number] {
  let tMin = -Infinity,
    tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / d[i]!;
    let t0 = (cube.centre[i]! - cube.halfExtent[i]! - o[i]!) * inv;
    let t1 = (cube.centre[i]! + cube.halfExtent[i]! - o[i]!) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
  }
  return [Math.max(tMin, 0), tMax];
}

function renderMarch(cube: Cube, cam: Camera, steps: number): Image {
  const rgb = new Float32Array(IMAGE_SIZE * IMAGE_SIZE * 3);
  const s = new Float32Array(2),
    c = new Float32Array(3);
  let fetches = 0;
  for (let py = 0; py < IMAGE_SIZE; py++) {
    for (let px = 0; px < IMAGE_SIZE; px++) {
      const d = rayDir(cam, px, py);
      const [tMin, tMax] = intersectCube(cube, cam.eye, d);
      if (tMax <= tMin) continue;
      const dt = (tMax - tMin) / steps;
      let aR = 0,
        aG = 0,
        aB = 0,
        aA = 0;
      for (let st = 0; st < steps && aA < 0.99; st++) {
        const t = tMin + (st + 0.5) * dt;
        windowSample(
          cube,
          cam.eye[0] + d[0] * t,
          cam.eye[1] + d[1] * t,
          cam.eye[2] + d[2] * t,
          dt,
          s,
        );
        fetches++;
        lutRgb(s[0]!, c);
        const w = (1 - aA) * s[1]!;
        aR += w * c[0]!;
        aG += w * c[1]!;
        aB += w * c[2]!;
        aA += w;
      }
      const o = (py * IMAGE_SIZE + px) * 3;
      rgb[o] = aR;
      rgb[o + 1] = aG;
      rgb[o + 2] = aB;
    }
  }
  return { w: IMAGE_SIZE, h: IMAGE_SIZE, rgb, fetches: fetches / (IMAGE_SIZE * IMAGE_SIZE) };
}

/** Texture fetches along a segment longer than its band is thick, capped. */
const MAX_SEGMENT_SAMPLES = 16;

function renderStack(stack: Stack, cam: Camera): Image {
  const rgb = new Float32Array(IMAGE_SIZE * IMAGE_SIZE * 3);
  const { radii, centre } = stack;
  const count = stack.shells.length;
  const rHi = radii[count]!,
    rLo = radii[0]!;
  const ts: number[] = [];
  const tex = new Float32Array(2),
    c = new Float32Array(3);
  const ex = cam.eye[0] - centre[0],
    ey = cam.eye[1] - centre[1],
    ez = cam.eye[2] - centre[2];
  const oo = ex * ex + ey * ey + ez * ez;
  let fetches = 0;
  for (let py = 0; py < IMAGE_SIZE; py++) {
    for (let px = 0; px < IMAGE_SIZE; px++) {
      const [dx, dy, dz] = rayDir(cam, px, py);
      // Every sphere crossing ahead of the eye, plus the eye itself when it sits inside.
      ts.length = 0;
      const b = ex * dx + ey * dy + ez * dz;
      for (let k = 0; k <= count; k++) {
        const rk = radii[k]!;
        if (rk <= 0) continue;
        const disc = b * b - (oo - rk * rk);
        if (disc <= 0) continue;
        const sq = Math.sqrt(disc);
        if (-b - sq > 0) ts.push(-b - sq);
        if (-b + sq > 0) ts.push(-b + sq);
      }
      if (ts.length === 0) continue;
      if (oo < rHi * rHi && oo > rLo * rLo) ts.push(0);
      ts.sort((p, q) => p - q);
      let aR = 0,
        aG = 0,
        aB = 0,
        aA = 0;
      for (let i = 0; i + 1 < ts.length && aA < 0.99; i++) {
        const t0 = ts[i]!,
          t1 = ts[i + 1]!;
        const tm = (t0 + t1) * 0.5;
        const rm = Math.hypot(ex + dx * tm, ey + dy * tm, ez + dz * tm);
        if (rm >= rHi || rm < rLo) continue;
        let k = 0;
        while (k + 1 < count && radii[k + 1]! <= rm) k++;
        const shell = stack.shells[k]!;
        // The texel holds one radial band thickness of medium; this segment is `ratio` of
        // it, and a segment much longer than the band sweeps across texels, so sample along it.
        const ratio = (t1 - t0) / (radii[k + 1]! - radii[k]!);
        const n = Math.min(MAX_SEGMENT_SAMPLES, Math.max(1, Math.ceil(ratio)));
        for (let q = 0; q < n && aA < 0.99; q++) {
          const t = t0 + ((q + 0.5) / n) * (t1 - t0);
          const sx = ex + dx * t,
            sy = ey + dy * t,
            sz = ez + dz * t;
          const r = Math.hypot(sx, sy, sz);
          const [u, v] = octEncode(sx / r, sy / r, sz / r);
          sampleShell(shell, u, v, tex);
          fetches++;
          const a = tex[0]!;
          const aSeg = a > 0 ? 1 - Math.pow(1 - a, ratio / n) : 0;
          lutRgb(tex[1]!, c);
          const w = (1 - aA) * aSeg;
          aR += w * c[0]!;
          aG += w * c[1]!;
          aB += w * c[2]!;
          aA += w;
        }
      }
      const o = (py * IMAGE_SIZE + px) * 3;
      rgb[o] = aR;
      rgb[o + 1] = aG;
      rgb[o + 2] = aB;
    }
  }
  return { w: IMAGE_SIZE, h: IMAGE_SIZE, rgb, fetches: fetches / (IMAGE_SIZE * IMAGE_SIZE) };
}

// --- output -----------------------------------------------------------------------

function tonemap(x: number): number {
  return Math.round(Math.min(1, Math.max(0, x)) ** (1 / 2.2) * 255);
}

function writeStrip(images: Image[], path: string): void {
  const w = images.reduce((n, im) => n + im.w + 4, -4);
  const h = images[0]!.h;
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  let x0 = 0;
  for (const im of images) {
    for (let y = 0; y < im.h; y++) {
      for (let x = 0; x < im.w; x++) {
        const s = (y * im.w + x) * 3,
          d = (y * w + x0 + x) * 4;
        png.data[d] = tonemap(im.rgb[s]!);
        png.data[d + 1] = tonemap(im.rgb[s + 1]!);
        png.data[d + 2] = tonemap(im.rgb[s + 2]!);
        png.data[d + 3] = 255;
      }
    }
    x0 += im.w + 4;
  }
  writeFileSync(path, PNG.sync.write(png));
}

/** Mean absolute error and PSNR over the display-gamma image, which is what the eye compares. */
function compare(truth: Image, test: Image): { mae: number; psnr: number } {
  let sum = 0,
    sq = 0;
  for (let i = 0; i < truth.rgb.length; i++) {
    const d = tonemap(truth.rgb[i]!) / 255 - tonemap(test.rgb[i]!) / 255;
    sum += Math.abs(d);
    sq += d * d;
  }
  const n = truth.rgb.length;
  return { mae: sum / n, psnr: 10 * Math.log10(1 / (sq / n)) };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]! : fallback;
}

function main(): void {
  const input = process.argv.slice(2).find((a) => a.endsWith('.npy'));
  const outDir = arg('--out', '');
  if (!input || !outDir) {
    console.error(
      'usage: tsx tools/spikes/shellStack/shellStackSpike.ts <cube.npy> --out <dir> [--centre cube|observer] [--shells N] [--res W] [--power P]',
    );
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const mode = arg('--centre', 'observer') as 'cube' | 'observer';
  const shellCount = Number(arg('--shells', '64'));
  const outerRes = Number(arg('--res', '512'));
  const power = Number(arg('--power', '1'));
  const tag = `${mode}-k${shellCount}-w${outerRes}-p${power}`;

  const cube = loadCube(input);
  const cubeBytes = cube.dims[0] * cube.dims[1] * cube.dims[2] * 2;
  let t = Date.now();
  const stack = bakeStack(cube, mode, shellCount, outerRes, power);
  const bandMpc = (stack.radii[shellCount]! - stack.radii[0]!) / shellCount;
  console.log(
    `bake ${tag}: ${((Date.now() - t) / 1000).toFixed(1)} s, r ${stack.radii[0]!.toFixed(0)}..${stack.radii[shellCount]!.toFixed(0)} Mpc, ` +
      `mean band ${bandMpc.toFixed(1)} Mpc = ${(bandMpc / cube.voxelMpc).toFixed(1)} voxels, ` +
      `${(stackBytes(stack) / 1e6).toFixed(1)} MB rg8 vs cube ${(cubeBytes / 1e6).toFixed(1)} MB f16`,
  );

  const C = cube.centre;
  const far = 2.5 * Math.max(...cube.halfExtent);
  const poses: Record<string, Camera> = {
    home: { eye: [0, 0, 0], target: C, fovDeg: 90 },
    nearhome: { eye: [60, 0, 0], target: C, fovDeg: 90 },
    orbit: { eye: [C[0] + far * 0.3, C[1] + far * 0.2, C[2] + far * 0.93], target: C, fovDeg: 50 },
    inside: {
      eye: [C[0] + 100, C[1] + 50, C[2]],
      target: [C[0] - 200, C[1] + 140, C[2] + 210],
      fovDeg: 50,
    },
  };
  for (const [name, cam] of Object.entries(poses)) {
    t = Date.now();
    const truth = renderMarch(cube, cam, 1024);
    const march = renderMarch(cube, cam, 128);
    const shells = renderStack(stack, cam);
    const m = compare(truth, march),
      s = compare(truth, shells);
    console.log(
      `${name.padEnd(9)} march128 mae ${m.mae.toFixed(4)} psnr ${m.psnr.toFixed(1)} fetches ${march.fetches.toFixed(0)} | ` +
        `shells mae ${s.mae.toFixed(4)} psnr ${s.psnr.toFixed(1)} fetches ${shells.fetches.toFixed(0)}  (${((Date.now() - t) / 1000).toFixed(0)} s)`,
    );
    writeStrip([truth, march, shells], join(outDir, `${name}-${tag}.png`));
  }
}

main();
