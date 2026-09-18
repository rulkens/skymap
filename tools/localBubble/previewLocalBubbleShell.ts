#!/usr/bin/env node
/**
 * previewLocalBubbleShell — offline render of the baked shell, so the look is
 * settled before a line of WGSL exists.
 *
 * Deliberately mirrors the shading the real pass would use — displaced
 * icosphere, Fresnel rim, additive, no depth — so what this produces is a
 * prediction of the renderer, not a different picture that happens to be of the
 * same data. Throwaway once the pass lands.
 */
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

const MAP_W = 1024;
const MAP_H = 512;
const OUT_W = 1280;
const OUT_H = 720;
const RIM_POWER = 3;
const INTENSITY = 0.5;
/** Icosphere subdivision — 20·4^5 = 20,480 triangles, the density the pass would ship. */
const SUBDIV = 5;
const RAD = Math.PI / 180;

type Vec3 = [number, number, number];

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** Unit icosphere by recursive edge-midpoint subdivision; returns triangles as vertex triples. */
function icosphere(subdivisions: number): Vec3[][] {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: Vec3[] = [
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
  ].map((v) => normalize(v as Vec3));
  let faces: number[][] = [
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
    const next: number[][] = [];
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const va = verts[a]!;
      const vb = verts[b]!;
      verts.push(normalize([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
      const index = verts.length - 1;
      cache.set(key, index);
      return index;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a!, b!);
      const bc = midpoint(b!, c!);
      const ca = midpoint(c!, a!);
      next.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return faces.map((f) => f.map((i) => verts[i]!) as Vec3[]);
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

async function main(): Promise<void> {
  const binPath = 'public/data/local-bubble/v1/local-bubble-shell.f32';
  const buf = readFileSync(binPath);
  const planeLength = MAP_W * MAP_H;
  const radius = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + planeLength * 4),
  );
  // The bake leaves ~40 NaN sight lines (upstream fit failures); a preview that
  // propagates them as black holes would read as shell structure that isn't there.
  let filled = 0;
  for (let i = 0; i < radius.length; i++) {
    if (!Number.isFinite(radius[i]!)) {
      radius[i] = 185;
      filled++;
    }
  }
  console.log(`preview: ${filled} non-finite texels filled with the mean radius`);

  const tris = icosphere(SUBDIV);
  console.log(`preview: ${tris.length} triangles`);

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

    const accum = new Float32Array(OUT_W * OUT_H);
    for (const tri of tris) {
      const world = tri.map((d) => {
        const r = radiusAt(radius, d);
        return [d[0] * r, d[1] * r, d[2] * r] as Vec3;
      });
      // Face normal of the DISPLACED triangle — the folds are exactly where this
      // departs from the sphere normal, and shading off `d` would erase them.
      const e1: Vec3 = [
        world[1]![0] - world[0]![0],
        world[1]![1] - world[0]![1],
        world[1]![2] - world[0]![2],
      ];
      const e2: Vec3 = [
        world[2]![0] - world[0]![0],
        world[2]![1] - world[0]![1],
        world[2]![2] - world[0]![2],
      ];
      const n = normalize([
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ]);
      const centre: Vec3 = [
        (world[0]![0] + world[1]![0] + world[2]![0]) / 3,
        (world[0]![1] + world[1]![1] + world[2]![1]) / 3,
        (world[0]![2] + world[1]![2] + world[2]![2]) / 3,
      ];
      const view = normalize([eye[0] - centre[0], eye[1] - centre[1], eye[2] - centre[2]]);
      const rim = Math.pow(
        1 - Math.abs(n[0] * view[0] + n[1] * view[1] + n[2] * view[2]),
        RIM_POWER,
      );
      const value = rim * INTENSITY;
      if (value <= 0.001) continue;

      const screen = world.map((w) => {
        const rel: Vec3 = [w[0] - eye[0], w[1] - eye[1], w[2] - eye[2]];
        const z = rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2];
        const xr = rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2];
        const yu = rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2];
        return [
          ((xr / (z * tanHalf * aspect)) * 0.5 + 0.5) * OUT_W,
          (0.5 - (yu / (z * tanHalf)) * 0.5) * OUT_H,
          z,
        ];
      });
      if (screen.some((s) => s[2]! <= 0)) continue;
      rasterize(accum, screen as number[][], value);
    }

    let peak = 0;
    for (const v of accum) if (v > peak) peak = v;
    const rgb = Buffer.alloc(OUT_W * OUT_H * 3);
    for (let i = 0; i < accum.length; i++) {
      const v = Math.min(1, accum[i]! / (peak || 1));
      const tone = Math.pow(v, 0.65);
      rgb[i * 3] = Math.round(tone * 214);
      rgb[i * 3 + 1] = Math.round(tone * 222);
      rgb[i * 3 + 2] = Math.round(tone * 255);
    }
    const outPath = join('docs/screenshots', `local-bubble-preview-${name}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    await sharp(rgb, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
      .png()
      .toFile(outPath);
    console.log(`preview: wrote ${outPath}`);
  }
}

/** Additive scanline fill — no depth, matching the pass's order-independent blend. */
function rasterize(accum: Float32Array, screen: number[][], value: number): void {
  const xs = screen.map((s) => s[0]!);
  const ys = screen.map((s) => s[1]!);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(OUT_W - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(OUT_H - 1, Math.ceil(Math.max(...ys)));
  const [x0, y0] = [xs[0]!, ys[0]!];
  const [x1, y1] = [xs[1]!, ys[1]!];
  const [x2, y2] = [xs[2]!, ys[2]!];
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / area;
      const w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / area;
      if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
      const at = y * OUT_W + x;
      accum[at] = accum[at]! + value;
    }
  }
}

await main();
