#!/usr/bin/env node
/**
 * previewLocalBubbleShell — offline render of the baked `.shell` mesh, so the
 * look is settled before a line of WGSL exists.
 *
 * Reads the same bytes `buildLocalBubbleShell` writes and the real pass would
 * fetch — no re-meshing here — so this predicts the renderer's shading
 * (additive, no depth, smooth per-pixel Fresnel), not a different picture of
 * the same data. Throwaway once the pass lands.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import type { Vec3 } from '../../src/@types/math/Vec3';
import { decodeShellMesh } from '../../src/data/shellMesh/shellMeshFormat';
import { normalize3 } from '../../src/utils/math/normalize3';
import { f16BitsToFloat } from '../utils/math/f16BitsToFloat';

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
const SHELL_PATH = 'public/data/local-bubble/v1/local-bubble.shell';
const RAD = Math.PI / 180;

/** Un-widen a `.shell` component array back to numbers, regardless of its on-disk dtype. */
function readComponent(values: Uint16Array | Float32Array, index: number, isF16: boolean): number {
  return isF16 ? f16BitsToFloat(values[index]!) : (values[index] as number);
}

function decodeVec3s(values: Uint16Array | Float32Array, isF16: boolean, centrePc: Vec3): Vec3[] {
  const count = values.length / 4;
  const out: Vec3[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = [
      readComponent(values, i * 4 + 0, isF16) + centrePc[0],
      readComponent(values, i * 4 + 1, isF16) + centrePc[1],
      readComponent(values, i * 4 + 2, isF16) + centrePc[2],
    ];
  }
  return out;
}

async function main(): Promise<void> {
  const buf = readFileSync(SHELL_PATH);
  const mesh = decodeShellMesh(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const isF16 = mesh.dtype === 'f16';
  // Normals carry no centre offset (w = 0); positions do (w = 1).
  const world = decodeVec3s(mesh.positions, isF16, mesh.centrePc);
  const normals = decodeVec3s(mesh.normals, isF16, [0, 0, 0]);
  const faceCount = mesh.indices.length / 3;
  console.log(
    `preview: read ${SHELL_PATH} — ${mesh.vertexCount} vertices, ${faceCount} faces, ${mesh.dtype}, frame ${mesh.frame}`,
  );

  const camDistPc = 1800;
  const fovY = 40 * RAD;
  const tanHalf = Math.tan(fovY / 2);
  const aspect = OUT_W / OUT_H;

  for (const [name, camDir] of [
    ['side', normalize3([1, 0.35, 0.25])],
    ['chimney', normalize3([0.2, 0.1, 1])],
  ] as const) {
    const eye: Vec3 = [camDir[0] * camDistPc, camDir[1] * camDistPc, camDir[2] * camDistPc];
    const fwd = normalize3([-eye[0], -eye[1], -eye[2]]);
    const right = normalize3([fwd[1], -fwd[0], 0]);
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
    for (let f = 0; f < faceCount; f++) {
      const ia = mesh.indices[f * 3 + 0]!;
      const ib = mesh.indices[f * 3 + 1]!;
      const ic = mesh.indices[f * 3 + 2]!;
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
