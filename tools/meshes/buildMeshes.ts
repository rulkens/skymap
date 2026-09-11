/**
 * buildMeshes — bake a source GLB to `public/data/meshes/<key>.mesh` plus its
 * three PBR PNGs, and rewrite `src/data/bodies/meshAssets.generated.ts`.
 *
 * The runtime never parses glTF: everything `@gltf-transform` knows (node
 * transforms, skins, materials, image containers) is resolved HERE, into flat
 * arrays and three texture slots the renderer binds unconditionally. So
 * substitution is a bake-time decision — a source with no normal map gets a
 * real 1x1 flat-normal PNG on disk, never a runtime branch. Spec:
 * docs/superpowers/specs/2026-09-10-mesh-bodies-design.md ("Tool").
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import { Document, NodeIO, Primitive, type Material, type Texture } from '@gltf-transform/core';
import sharp from 'sharp';

import type { MeshAssetRow } from '../../src/data/bodies/meshAssets.generated';
import type { Mat3 } from '../../src/@types/math/Mat3';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { RAW_DATA, rawDataPath, type RawDataEntry } from '../utils/io/rawDataRegistry';
import { MESH_SOURCES } from '../utils/io/meshSources';
import { generateTangents } from './generateTangents';
import { meanAlbedo } from './meanAlbedo';
import { writeMeshBinary } from './writeMeshBinary';

/**
 * Both budgets are constants rather than CLI flags: they describe what the
 * renderer can afford, which does not vary per invocation. The triangle
 * ceiling leaves room for the petunia model's ~150k post-prebake tris; the
 * texture ceiling matches the 2048^2 atlas that bake emits.
 */
const TRIANGLE_BUDGET = 150_000;
const TEXTURE_SIZE_BUDGET = 2048;

/** Tangent-space "straight out", the substitute for a missing normal map. */
const FLAT_NORMAL = { r: 128, g: 128, b: 255 };

export type MeshBuildTarget = {
  readonly key: string;
  readonly glbPath: string;
  readonly source: string;
  readonly licence: string;
  readonly attribution: string;
  readonly bodyFromSource?: Mat3;
};

type Geometry = {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boundingRadiusM: number;
};

/**
 * Every primitive reachable from the default scene, with its node's world
 * matrix. Nodes off the scene graph are deliberately skipped: an orphan left
 * behind by an exporter is not part of the model, and counting it would let it
 * contribute vertices and trip the one-material refusal.
 */
function listPrimitives(doc: Document): { prim: Primitive; matrix: number[] }[] {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const out: { prim: Primitive; matrix: number[] }[] = [];
  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = [...node.getWorldMatrix()];
    for (const prim of mesh.listPrimitives()) out.push({ prim, matrix });
  });
  return out;
}

/** Triangles a primitive draws, indexed or not. */
function triangleCount(prim: Primitive): number {
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
  return count / 3;
}

/**
 * Bake the rest pose: clear every skin and animation and drop the joint /
 * weight attributes. The `.mesh` format has no joint data and the runtime has
 * no skinning path, so a rigged source (the whale is one) is de-rigged, never
 * refused.
 */
function deRig(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) node.setSkin(null);
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  for (const animation of doc.getRoot().listAnimations()) animation.dispose();
  for (const { prim } of listPrimitives(doc)) {
    for (const semantic of prim.listSemantics()) {
      if (/^(JOINTS|WEIGHTS)_/.test(semantic)) prim.setAttribute(semantic, null);
    }
  }
}

/**
 * The one gate on input shape. Several primitives sharing one material is a
 * routine export (the whale ships three) and gets merged; several MATERIALS is
 * a refusal with no escape hatch, because the fix belongs upstream in a Blender
 * pre-bake that flattens the stack — the one place that can actually solve it.
 */
function soleMaterial(doc: Document, key: string): Material {
  const materials = new Set<Material>();
  for (const { prim } of listPrimitives(doc)) {
    if (prim.getMode() !== Primitive.Mode.TRIANGLES) {
      throw new Error(`buildMeshes: ${key} has a non-TRIANGLES primitive (mode ${prim.getMode()})`);
    }
    const material = prim.getMaterial();
    if (material) materials.add(material);
  }
  if (materials.size !== 1) {
    throw new Error(
      `buildMeshes: ${key} has ${materials.size} materials — flatten it to one upstream ` +
        '(Blender pre-bake) before baking',
    );
  }
  return [...materials][0]!;
}

function countTriangles(doc: Document): number {
  let n = 0;
  for (const { prim } of listPrimitives(doc)) n += triangleCount(prim);
  return n;
}

/**
 * Fold a source→body rotation in FRONT of a node's world matrix. Every
 * attribute already rides that one matrix through its own correct rule, so
 * composing here reorients positions, normals and tangents alike — and, being a
 * proper rotation, leaves the mirrored-node and winding verdicts below unmoved.
 */
function premultiplyMat3(r: Mat3, m: readonly number[]): number[] {
  const out: number[] = [];
  for (let c = 0; c < 4; c++) {
    const x = m[c * 4]!;
    const y = m[c * 4 + 1]!;
    const z = m[c * 4 + 2]!;
    out.push(
      r[0] * x + r[3] * y + r[6] * z,
      r[1] * x + r[4] * y + r[7] * z,
      r[2] * x + r[5] * y + r[8] * z,
      m[c * 4 + 3]!,
    );
  }
  return out;
}

/** Column-major mat4 point transform; glTF node matrices are column-major. */
function transformPoint(m: readonly number[], x: number, y: number, z: number): Vec3 {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

function normalize(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/**
 * Determinant of the upper-left 3x3. Negative means the node MIRRORS its
 * geometry — routine on a bilaterally symmetric Sketchfab export, where one
 * half is an instance of the other under a negative scale.
 */
function basisDeterminant(m: readonly number[]): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
    m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
    m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!)
  );
}

/**
 * Surface NORMALS transform by the cofactor matrix (the adjugate transpose,
 * minus a determinant divide renormalizing discards): under non-uniform scale
 * the plain 3x3 skews them off the surface. Cofactors carry the determinant's
 * SIGN, though, so a mirrored node comes back inside-out and is flipped here.
 */
function transformNormal(m: readonly number[], det: number, x: number, y: number, z: number): Vec3 {
  // Columns of the upper-left 3x3: (a,b,c), (d,e,f), (g,h,i).
  const a = m[0]!;
  const b = m[1]!;
  const c = m[2]!;
  const d = m[4]!;
  const e = m[5]!;
  const f = m[6]!;
  const g = m[8]!;
  const h = m[9]!;
  const i = m[10]!;
  const s = det < 0 ? -1 : 1;
  return normalize(
    s * ((e * i - h * f) * x + (h * c - b * i) * y + (b * f - e * c) * z),
    s * ((g * f - d * i) * x + (a * i - g * c) * y + (d * c - a * f) * z),
    s * ((d * h - g * e) * x + (g * b - a * h) * y + (a * e - d * b) * z),
  );
}

/**
 * TANGENTS lie IN the surface, so they take the PLAIN 3x3 — the split
 * `@gltf-transform`'s own `transformPrimitive` makes between its normal matrix
 * (inverse-transpose) and its tangent matrix. Re-orthogonalised against the
 * already-transformed normal, which a non-uniform scale bends away from it.
 */
function transformTangent(m: readonly number[], n: Vec3, x: number, y: number, z: number): Vec3 {
  const vx = m[0]! * x + m[4]! * y + m[8]! * z;
  const vy = m[1]! * x + m[5]! * y + m[9]! * z;
  const vz = m[2]! * x + m[6]! * y + m[10]! * z;
  const dot = vx * n[0] + vy * n[1] + vz * n[2];
  return normalize(vx - n[0] * dot, vy - n[1] * dot, vz - n[2] * dot);
}

/**
 * Whether a triangle's winding agrees with the authored NORMAL it interpolates.
 * A SketchUp two-sided face exports wound either way (34k of the petunias'
 * 150k disagree), so winding is normalised at bake time rather than trusted —
 * the mean of the three normals, since a smooth-shaded corner has no one truth.
 * A degenerate triangle has no facing and keeps its authored order.
 */
function windingFollowsNormal(
  positions: readonly number[],
  normals: readonly number[],
  i0: number,
  i1: number,
  i2: number,
): boolean {
  const a = i0 * 3;
  const b = i1 * 3;
  const c = i2 * 3;
  const ux = positions[b]! - positions[a]!;
  const uy = positions[b + 1]! - positions[a + 1]!;
  const uz = positions[b + 2]! - positions[a + 2]!;
  const vx = positions[c]! - positions[a]!;
  const vy = positions[c + 1]! - positions[a + 1]!;
  const vz = positions[c + 2]! - positions[a + 2]!;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  if (cx === 0 && cy === 0 && cz === 0) return true;
  const nx = normals[a]! + normals[b]! + normals[c]!;
  const ny = normals[a + 1]! + normals[b + 1]! + normals[c + 1]!;
  const nz = normals[a + 2]! + normals[b + 2]! + normals[c + 2]!;
  return cx * nx + cy * ny + cz * nz >= 0;
}

/**
 * Merge every primitive into one vertex/index buffer with node transforms — and
 * the source's optional body-frame remap — baked in, then RECENTRE on the
 * AREA-WEIGHTED SURFACE CENTROID of its triangles. A bbox centre would let a
 * long thin appendage (the whale's tail) drag the origin — and with it the
 * selection ring, pick sphere and caption anchor it all shares — off the
 * visible mass; weighting by triangle area keeps it on the surface instead.
 *
 * An authored `TANGENT` is used verbatim; `generateTangents` runs only when the
 * source has none on EVERY primitive, since regenerating over a good frame
 * silently breaks normal-mapped shading.
 */
function mergeGeometry(doc: Document, bodyFromSource?: Mat3): Geometry {
  const prims = listPrimitives(doc);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  const authoredTangents = prims.every(({ prim }) => prim.getAttribute('TANGENT') !== null);

  for (const { prim, matrix: nodeMatrix } of prims) {
    const matrix = bodyFromSource ? premultiplyMat3(bodyFromSource, nodeMatrix) : nodeMatrix;
    const base = positions.length / 3;
    const mirrored = basisDeterminant(matrix) < 0;
    const det = mirrored ? -1 : 1;
    const pos = prim.getAttribute('POSITION');
    const nrm = prim.getAttribute('NORMAL');
    const uv = prim.getAttribute('TEXCOORD_0');
    const tan = prim.getAttribute('TANGENT');
    if (!pos) throw new Error('buildMeshes: primitive without POSITION');

    for (let v = 0; v < pos.getCount(); v++) {
      const p = pos.getElement(v, [0, 0, 0]);
      const world = transformPoint(matrix, p[0]!, p[1]!, p[2]!);
      positions.push(...world);

      const n = nrm ? nrm.getElement(v, [0, 0, 0]) : [0, 0, 1];
      const normal = transformNormal(matrix, det, n[0]!, n[1]!, n[2]!);
      normals.push(...normal);

      const t = uv ? uv.getElement(v, [0, 0]) : [0, 0];
      uvs.push(t[0]!, t[1]!);

      if (authoredTangents && tan) {
        const a = tan.getElement(v, [0, 0, 0, 0]);
        const d = transformTangent(matrix, normal, a[0]!, a[1]!, a[2]!);
        // Mirroring swaps which side of the tangent the bitangent falls on, so
        // the handedness bit swaps with it.
        const w = a[3]! < 0 ? -1 : 1;
        tangents.push(d[0], d[1], d[2], mirrored ? -w : w);
      }
    }

    // A mirrored node also inverts triangle winding, so undo that first; the
    // per-face normalisation then judges the geometry as it will be drawn.
    const idx = prim.getIndices();
    const count = idx ? idx.getCount() : pos.getCount();
    const at = (i: number) => base + (idx ? idx.getScalar(i) : i);
    for (let i = 0; i < count; i += 3) {
      const i0 = at(i);
      const i1 = at(mirrored ? i + 2 : i + 1);
      const i2 = at(mirrored ? i + 1 : i + 2);
      if (windingFollowsNormal(positions, normals, i0, i1, i2)) indices.push(i0, i1, i2);
      else indices.push(i0, i2, i1);
    }
  }

  // sum(triangleArea * triangleCentroid) / sum(triangleArea) — see the docblock
  // above for why this beats a bbox centre.
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let totalArea = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3;
    const b = indices[i + 1]! * 3;
    const c = indices[i + 2]! * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    cx += (area * (positions[a]! + positions[b]! + positions[c]!)) / 3;
    cy += (area * (positions[a + 1]! + positions[b + 1]! + positions[c + 1]!)) / 3;
    cz += (area * (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!)) / 3;
    totalArea += area;
  }
  cx /= totalArea;
  cy /= totalArea;
  cz /= totalArea;

  const centred = new Float32Array(positions.length);
  let radiusSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]! - cx;
    const y = positions[i + 1]! - cy;
    const z = positions[i + 2]! - cz;
    centred[i] = x;
    centred[i + 1] = y;
    centred[i + 2] = z;
    radiusSq = Math.max(radiusSq, x ** 2 + y ** 2 + z ** 2);
  }

  const geometry = {
    positions: centred,
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    boundingRadiusM: Math.sqrt(radiusSq),
  };
  return {
    ...geometry,
    tangents: authoredTangents ? new Float32Array(tangents) : generateTangents(geometry),
  };
}

/**
 * Write one texture slot, resized into the budget. `_albedo.png` is sRGB;
 * `_normal.png` and `_mr.png` are LINEAR data and must not be colour-managed —
 * sharp neither converts colourspace nor embeds an ICC profile by default, and
 * the fetcher's `colorSpaceConversion: 'none'` is the matching half.
 */
async function writeTexture(
  texture: Texture | null,
  fallback: { r: number; g: number; b: number },
  path: string,
): Promise<void> {
  const image = texture?.getImage();
  const pipeline = image
    ? sharp(image).resize({
        width: TEXTURE_SIZE_BUDGET,
        height: TEXTURE_SIZE_BUDGET,
        fit: 'inside',
        withoutEnlargement: true,
      })
    : sharp({ create: { width: 1, height: 1, channels: 3, background: fallback } });
  await pipeline.png().toFile(path);
}

async function bake(target: MeshBuildTarget, outDir: string): Promise<MeshAssetRow> {
  const { key } = target;
  const doc = await new NodeIO().read(target.glbPath);
  deRig(doc);
  const material = soleMaterial(doc, key);

  const triangles = countTriangles(doc);
  if (triangles > TRIANGLE_BUDGET) {
    const { simplify } = await import('@gltf-transform/functions');
    const { MeshoptSimplifier } = await import('meshoptimizer');
    await MeshoptSimplifier.ready;
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: TRIANGLE_BUDGET / triangles, error: 0.001 }),
    );
    // meshopt stops early rather than wreck topology, so the budget is a target
    // it can miss — say so instead of shipping a silently over-budget mesh.
    const after = countTriangles(doc);
    if (after > TRIANGLE_BUDGET) {
      console.warn(
        `buildMeshes: ${key} is still ${after} tris after decimation (budget ${TRIANGLE_BUDGET})`,
      );
    }
  }

  const geometry = mergeGeometry(doc, target.bodyFromSource);
  writeFileSync(join(outDir, `${key}.mesh`), Buffer.from(writeMeshBinary(geometry)));

  const normalTexture = material.getNormalTexture();
  const mrTexture = material.getMetallicRoughnessTexture();
  if (!normalTexture) {
    console.warn(`buildMeshes: ${key} has no normal map — substituting a 1x1 flat normal`);
  }
  if (!mrTexture) {
    console.warn(
      `buildMeshes: ${key} has no metallicRoughness map — substituting a 1x1 constant from ` +
        `metallic ${material.getMetallicFactor()} / roughness ${material.getRoughnessFactor()}`,
    );
  }

  const factor = material.getBaseColorFactor();
  const baseColorTexture = material.getBaseColorTexture();
  const albedoPath = join(outDir, `${key}_albedo.png`);
  await writeTexture(baseColorTexture, srgbByte(factor[0], factor[1], factor[2]), albedoPath);
  await writeTexture(normalTexture, FLAT_NORMAL, join(outDir, `${key}_normal.png`));
  // glTF packs roughness in G and metallic in B; R is unused by the spec.
  await writeTexture(
    mrTexture,
    {
      r: 0,
      g: Math.round(material.getRoughnessFactor() * 255),
      b: Math.round(material.getMetallicFactor() * 255),
    },
    join(outDir, `${key}_mr.png`),
  );

  const { data, info } = await sharp(albedoPath).raw().toBuffer({ resolveWithObject: true });
  // glTF's base colour is factor x texture, so the glint's colour is too. The
  // 1x1 substitute already carries the factor, hence the guard.
  const mean = meanAlbedo(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
  ).map((c, i) => (baseColorTexture ? c * factor[i]! : c)) as Vec3;

  return {
    key,
    path: `meshes/${key}.mesh`,
    boundingRadiusM: geometry.boundingRadiusM,
    meanAlbedo: mean.map((c) => Number(c.toFixed(6))) as Vec3,
    triangleCount: geometry.indices.length / 3,
    normalMapSubstituted: normalTexture === null,
    source: target.source,
    licence: target.licence,
    attribution: target.attribution,
  };
}

/** Linear baseColour factor → the sRGB byte a 1x1 substitute PNG stores. */
function srgbByte(r: number, g: number, b: number): { r: number; g: number; b: number } {
  const encode = (c: number) =>
    Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  return { r: encode(r), g: encode(g), b: encode(b) };
}

const GENERATED_BANNER =
  '// src/data/bodies/meshAssets.generated.ts\n' +
  '// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!\n' +
  '// Regenerate with:  npm run build-meshes\n' +
  '// Source of truth:  data/raw/meshes/**\n';

/** Prettier's `quoteProps: as-needed` / `singleQuote` output, reproduced. */
function quote(s: string): string {
  return s.includes("'") || s.includes('\\') ? JSON.stringify(s) : `'${s}'`;
}

/**
 * Prettier's `printWidth: 100` break — after the colon, since it cannot split a
 * string literal. `format:check` runs over this generated file, so emitting
 * anything else makes a fresh bake fail the format gate.
 */
function field(name: string, value: string): string {
  const flat = `    ${name}: ${value},`;
  return flat.length <= 100 ? flat : `    ${name}:\n      ${value},`;
}

function serializeMeshAssets(rows: readonly MeshAssetRow[]): string {
  const body = rows
    .map((row) =>
      [
        `  ${/^[A-Za-z_$][\w$]*$/.test(row.key) ? row.key : quote(row.key)}: {`,
        field('key', quote(row.key)),
        field('path', quote(row.path)),
        field('boundingRadiusM', String(row.boundingRadiusM)),
        field('meanAlbedo', `[${row.meanAlbedo.join(', ')}]`),
        field('triangleCount', String(row.triangleCount)),
        field('normalMapSubstituted', String(row.normalMapSubstituted)),
        field('source', quote(row.source)),
        field('licence', quote(row.licence)),
        field('attribution', quote(row.attribution)),
        '  },',
      ].join('\n'),
    )
    .join('\n');
  return (
    GENERATED_BANNER +
    "import type { Vec3 } from '../../@types/math/Vec3';\n" +
    '\n' +
    'export type MeshAssetRow = {\n' +
    '  readonly key: string;\n' +
    '  readonly path: string;\n' +
    '  readonly boundingRadiusM: number;\n' +
    '  readonly meanAlbedo: Vec3;\n' +
    '  readonly triangleCount: number;\n' +
    '  readonly normalMapSubstituted: boolean;\n' +
    '  readonly source: string;\n' +
    '  readonly licence: string;\n' +
    '  readonly attribution: string; // author + URL; empty string for CC0\n' +
    '};\n' +
    '\n' +
    'export const MESH_ASSETS: Readonly<Record<string, MeshAssetRow>> = ' +
    (rows.length === 0 ? '{};\n' : `{\n${body}\n};\n`)
  );
}

/**
 * Bake every target, then write the generated table in one go. Provenance is
 * printed BEFORE anything is written, so an unlicensed or uncredited source is
 * caught while the tree is still clean.
 */
export async function buildMeshes(options: {
  readonly targets: readonly MeshBuildTarget[];
  readonly outDir: string;
  readonly generatedPath: string;
}): Promise<readonly MeshAssetRow[]> {
  for (const t of options.targets) {
    process.stderr.write(
      `buildMeshes: ${t.key}  source ${t.source}  licence ${t.licence}  ` +
        `attribution ${t.attribution || '(CC0 — none required)'}\n`,
    );
  }
  mkdirSync(options.outDir, { recursive: true });

  const rows: MeshAssetRow[] = [];
  for (const target of options.targets) {
    const row = await bake(target, options.outDir);
    rows.push(row);
    process.stderr.write(
      `  ok   ${row.path}  ${row.triangleCount} tris  r=${row.boundingRadiusM.toFixed(3)} m\n`,
    );
  }

  writeFileSync(options.generatedPath, serializeMeshAssets(rows));
  process.stderr.write(`  ok   meshAssets.generated.ts  (${rows.length} meshes)\n`);
  return rows;
}

async function main(): Promise<void> {
  const targets = Object.entries(MESH_SOURCES).map(([key, entry]) => {
    const raw: RawDataEntry = RAW_DATA[entry.native];
    return {
      key,
      glbPath: rawDataPath(entry.native),
      source: raw.upstream ?? raw.path,
      licence: entry.licence,
      attribution: entry.attribution,
      bodyFromSource: entry.bodyFromSource,
    };
  });
  await buildMeshes({
    targets,
    outDir: resolve('public/data/meshes'),
    generatedPath: resolve('src/data/bodies/meshAssets.generated.ts'),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
