#!/usr/bin/env node
/**
 * previewLocalBubbleShell — offline render of the baked shell, so the look is
 * settled before a line of WGSL exists.
 *
 * Deliberately mirrors the shading the real pass would use — adaptively
 * tessellated shell, smooth per-pixel Fresnel, additive, no depth — so this is
 * a prediction of the renderer, not a different picture of the same data.
 * Throwaway once the pass lands.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import type { Vec3 } from '../../src/@types/math/Vec3';
import { refineMeshByEdgeLength } from '../utils/geo/refineMeshByEdgeLength';

const MAP_W = 1024;
const MAP_H = 512;
const OUT_W = 1280;
const OUT_H = 720;
/**
 * Supersampling factor. The shell is nearly all silhouette and thin creases, so
 * geometric aliasing on those edges is most of what the eye reads as roughness
 * — a jagged rim is indistinguishable from a badly tessellated one, which would
 * make this preview lie about the geometry it exists to judge.
 */
const SUPERSAMPLE = 3;
const RENDER_W = OUT_W * SUPERSAMPLE;
const RENDER_H = OUT_H * SUPERSAMPLE;
const RIM_POWER = 3;
const INTENSITY = 0.5;
/**
 * Fixed exposure, not a per-image peak normalisation: auto-levelling made two
 * runs incomparable, which defeats the point of a preview you re-render after
 * every tuning change.
 */
const EXPOSURE = 2.6;
/** Uniform base before adaptive refinement — enough that the first pass sees sane shapes. */
const BASE_SUBDIV = 2;
/**
 * Adaptive target for a displaced edge, pc. The chimney and the steep slopes are
 * what drive this: at a uniform subdivision the same mesh runs 7.6 pc at the
 * median and 148 pc at the tail, and matching that tail uniformly would cost
 * ~21M triangles.
 */
const TARGET_EDGE_PC = 4;
const MAX_REFINE_PASSES = 8;
const MAX_FACES = 500000;
const RAD = Math.PI / 180;

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Uniformly subdivided icosahedron — the base the adaptive pass refines. */
function icosphere(subdivisions: number): {
  directions: Vec3[];
  faces: [number, number, number][];
} {
  const t = (1 + Math.sqrt(5)) / 2;
  const directions: Vec3[] = (
    [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ] as Vec3[]
  ).map(normalize);
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map<string, number>();
    const next: [number, number, number][] = [];
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = directions[a]!;
      const vb = directions[b]!;
      directions.push(normalize([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
      cache.set(key, directions.length - 1);
      return directions.length - 1;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { directions, faces };
}

/** Bilinear sample of the equirect radius plane for a galactic direction. */
function radiusAt(plane: Float32Array, dir: Vec3): number {
  const l = Math.atan2(dir[1], dir[0]);
  const b = Math.asin(Math.max(-1, Math.min(1, dir[2])));
  const u = ((l / (2 * Math.PI) + 1) % 1) * MAP_W - 0.5;
  const v = (0.5 - b / Math.PI) * MAP_H - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.max(0, Math.min(MAP_H - 1, Math.floor(v)));
  const y1 = Math.min(MAP_H - 1, y0 + 1);
  const fx = u - x0;
  const fy = v - y0;
  const xa = ((x0 % MAP_W) + MAP_W) % MAP_W;
  const xb = (xa + 1) % MAP_W;
  const s = (x: number, y: number): number => plane[y * MAP_W + x]!;
  const top = s(xa, y0) * (1 - fx) + s(xb, y0) * fx;
  const bot = s(xa, y1) * (1 - fx) + s(xb, y1) * fx;
  return top * (1 - fy) + bot * fy;
}

/**
 * Area-weighted vertex normals. Flat face normals were the OTHER half of the
 * visible faceting — a Fresnel term that jumps at every edge shows the mesh no
 * matter how fine it is, and the real pass would interpolate these per pixel.
 */
function vertexNormals(
  world: Vec3[],
  faces: readonly (readonly [number, number, number])[],
): Vec3[] {
  const normals: Vec3[] = world.map(() => [0, 0, 0]);
  for (const [a, b, c] of faces) {
    const pa = world[a]!;
    const pb = world[b]!;
    const pc = world[c]!;
    const e1: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const e2: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    // Un-normalized cross product: its length is twice the face area, which is
    // exactly the weight a smooth normal wants.
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    for (const i of [a, b, c]) {
      normals[i]![0] += n[0];
      normals[i]![1] += n[1];
      normals[i]![2] += n[2];
    }
  }
  return normals.map(normalize);
}

async function main(): Promise<void> {
  const binPath = 'data/localBubble/local-bubble-shell.f32';
  const buf = readFileSync(binPath);
  const planeLength = MAP_W * MAP_H;
  const radius = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + planeLength * 4),
  );
  let filled = 0;
  for (let i = 0; i < radius.length; i++) {
    if (!Number.isFinite(radius[i]!)) {
      radius[i] = 185;
      filled++;
    }
  }
  if (filled > 0) console.log(`preview: ${filled} non-finite texels filled with the mean radius`);

  const base = icosphere(BASE_SUBDIV);
  const radiusOf = (d: Vec3): number => radiusAt(radius, d);
  const mesh = refineMeshByEdgeLength(
    base.directions,
    base.faces,
    radiusOf,
    TARGET_EDGE_PC,
    MAX_REFINE_PASSES,
    MAX_FACES,
  );
  const world: Vec3[] = mesh.directions.map((d) => {
    const r = radiusOf(d);
    return [d[0] * r, d[1] * r, d[2] * r];
  });
  const normals = vertexNormals(world, mesh.faces);
  console.log(
    `preview: ${base.faces.length} base → ${mesh.faces.length} tris after adaptive refinement (target ${TARGET_EDGE_PC} pc)`,
  );
  console.log(`preview: longest displaced edge ${longestEdge(world, mesh.faces).toFixed(2)} pc`);

  const camDistPc = 1800;
  const fovY = 40 * RAD;
  const tanHalf = Math.tan(fovY / 2);
  const aspect = OUT_W / OUT_H;

  for (const [name, camDir] of [
    ['side', normalize([1, 0.35, 0.25])],
    ['chimney', normalize([0.2, 0.1, 1])],
  ] as const) {
    const eye: Vec3 = [camDir[0] * camDistPc, camDir[1] * camDistPc, camDir[2] * camDistPc];
    const fwd = normalize([-eye[0], -eye[1], -eye[2]]);
    const right = normalize([fwd[1], -fwd[0], 0]);
    const up: Vec3 = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0],
    ];

    const project = (w: Vec3): [number, number, number] => {
      const rel: Vec3 = [w[0] - eye[0], w[1] - eye[1], w[2] - eye[2]];
      const z = rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2];
      const xr = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
      const yu = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
      return [
        ((xr / (z * tanHalf * aspect)) * 0.5 + 0.5) * RENDER_W,
        (0.5 - (yu / (z * tanHalf)) * 0.5) * RENDER_H,
        z,
      ];
    };

    const accum = new Float32Array(RENDER_W * RENDER_H);
    for (const [ia, ib, ic] of mesh.faces) {
      const s0 = project(world[ia]!);
      const s1 = project(world[ib]!);
      const s2 = project(world[ic]!);
      if (s0[2] <= 0 || s1[2] <= 0 || s2[2] <= 0) continue;
      shadeTriangle(
        accum,
        [s0, s1, s2],
        [world[ia]!, world[ib]!, world[ic]!],
        [normals[ia]!, normals[ib]!, normals[ic]!],
        eye,
      );
    }

    // Box-downsample before tone mapping: the accumulation is linear and
    // additive, so the mean of a block is exactly that pixel's coverage.
    const resolved = new Float32Array(OUT_W * OUT_H);
    const inv = 1 / (SUPERSAMPLE * SUPERSAMPLE);
    for (let y = 0; y < OUT_H; y++) {
      for (let x = 0; x < OUT_W; x++) {
        let sum = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          const row = (y * SUPERSAMPLE + sy) * RENDER_W + x * SUPERSAMPLE;
          for (let sx = 0; sx < SUPERSAMPLE; sx++) sum += accum[row + sx]!;
        }
        resolved[y * OUT_W + x] = sum * inv;
      }
    }

    const lit = [...resolved].filter((v) => v > 0).sort((a, b) => a - b);
    console.log(
      `preview[${name}]: covered ${lit.length} px, p50=${(lit[lit.length >> 1] ?? 0).toFixed(3)} p99=${(lit[Math.floor(lit.length * 0.99)] ?? 0).toFixed(3)}`,
    );
    const rgb = Buffer.alloc(OUT_W * OUT_H * 3);
    for (let i = 0; i < resolved.length; i++) {
      const v = Math.min(1, resolved[i]! * EXPOSURE);
      const tone = Math.pow(v, 0.65);
      rgb[i * 3] = Math.round(tone * 214);
      rgb[i * 3 + 1] = Math.round(tone * 222);
      rgb[i * 3 + 2] = Math.round(tone * 255);
    }
    const outPath = join('data/localBubble/previews', `local-bubble-preview-${name}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    await sharp(rgb, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
      .png()
      .toFile(outPath);
    console.log(`preview: wrote ${outPath}`);
  }
}

function longestEdge(
  world: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
): number {
  let worst = 0;
  for (const [a, b, c] of faces) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const wp = world[p!]!;
      const wq = world[q!]!;
      worst = Math.max(worst, Math.hypot(wp[0] - wq[0], wp[1] - wq[1], wp[2] - wq[2]));
    }
  }
  return worst;
}

/** Additive scanline fill with per-pixel Fresnel — no depth, order-independent like the pass. */
function shadeTriangle(
  accum: Float32Array,
  screen: readonly [number, number, number][],
  world: readonly Vec3[],
  normals: readonly Vec3[],
  eye: Vec3,
): void {
  const [x0, y0] = screen[0]!;
  const [x1, y1] = screen[1]!;
  const [x2, y2] = screen[2]!;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(RENDER_W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(RENDER_H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(det) < 1e-9) return;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / det;
      const l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;

      const nx = l0 * normals[0]![0] + l1 * normals[1]![0] + l2 * normals[2]![0];
      const ny = l0 * normals[0]![1] + l1 * normals[1]![1] + l2 * normals[2]![1];
      const nz = l0 * normals[0]![2] + l1 * normals[1]![2] + l2 * normals[2]![2];
      const nl = Math.hypot(nx, ny, nz) || 1;

      const wx = l0 * world[0]![0] + l1 * world[1]![0] + l2 * world[2]![0];
      const wy = l0 * world[0]![1] + l1 * world[1]![1] + l2 * world[2]![1];
      const wz = l0 * world[0]![2] + l1 * world[1]![2] + l2 * world[2]![2];
      const vx = eye[0] - wx;
      const vy = eye[1] - wy;
      const vz = eye[2] - wz;
      const vl = Math.hypot(vx, vy, vz) || 1;

      const cosTheta = Math.abs((nx * vx + ny * vy + nz * vz) / (nl * vl));
      const at = y * RENDER_W + x;
      accum[at] = accum[at]! + Math.pow(1 - cosTheta, RIM_POWER) * INTENSITY;
    }
  }
}

await main();
