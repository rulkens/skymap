/**
 * buildMeshes — bake each tier's source GLB to `public/data/meshes/<key>-<tier>.mesh`
 * plus one PNG per `MESH_TEXTURE_SLOTS` row, and rewrite
 * `src/data/bodies/meshAssets.generated.ts`.
 *
 * The runtime never parses glTF: everything `@gltf-transform` knows (node
 * transforms, skins, materials, image containers) is resolved HERE, into flat
 * arrays and the texture slots the renderer binds unconditionally. So
 * substitution is a bake-time decision — a source with no normal map gets a
 * real 1x1 flat-normal PNG on disk, never a runtime branch. Spec:
 * docs/superpowers/specs/2026-09-10-mesh-bodies-design.md ("Tool").
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';

import {
  Document,
  NodeIO,
  Primitive,
  type Accessor,
  type Material,
  type Texture,
} from '@gltf-transform/core';
import sharp from 'sharp';

import type { MeshAssetRow } from '../../src/data/bodies/meshAssets.generated';
import type { ContactDecal } from '../../src/@types/data/mesh/ContactDecal';
import type { Mat3 } from '../../src/@types/math/Mat3';
import type { MeshTextureField } from '../../src/@types/data/mesh/MeshTextureField';
import type { Tier } from '../../src/@types/data/Tier';
import type { Vec3 } from '../../src/@types/math/Vec3';
import type { BakeTierResult } from './@types/BakeTierResult';
import type { ContactDecalStamp } from './@types/ContactDecalStamp';
import type { Geometry } from './@types/Geometry';
import { MESH_TEXTURE_SLOTS } from '../../src/data/mesh/meshTextureSlots';
import { MESH_TRIANGLE_BUDGET } from '../../src/data/mesh/meshTriangleBudget';
import { TIER_LADDER } from '../../src/data/tierLadder';
import { tierToTexturePx } from '../../src/utils/math/tierToTexturePx';
import { meshTierPrefix } from '../../src/utils/meshBodies/meshTierPrefix';
import { rotateVec3ByTightMat3 } from '../../src/utils/math/rotateVec3ByTightMat3';
import { RAW_DATA, rawDataPath, type RawDataEntry } from '../utils/io/rawDataRegistry';
import { MESH_SOURCES } from '../utils/io/meshSources';
import { computeSmoothNormals } from '../utils/meshes/computeSmoothNormals';
import { meshGroundUpSource } from '../utils/meshes/meshGroundUpSource';
import { simplifyToTriangles } from '../utils/meshes/simplifyToTriangles';
import { quote } from '../utils/codegen/quote';
import { MESH_ASSET_ROW_FIELDS } from './meshAssetRowFields';
import { generateTangents } from './generateTangents';
import { meanAlbedo } from './meanAlbedo';
import { writeMeshBinary } from './writeMeshBinary';

// The contact shadow is a soft blur under a few-metre footprint: 512^2 is
// ~1 cm/texel there, and nothing sharper survives the blur.
const CONTACT_SIZE_BUDGET = 512;
// Lossy only where the eye is the judge: colour maps and the shadow mask.
// Normal and metal-rough maps are data — a lossy codec bends slopes and
// roughness — so they ship lossless.
const LOSSY_WEBP = { quality: 90 };
const LOSSLESS_WEBP = { lossless: true };

/** Tangent-space "straight out", the substitute for a missing normal map. */
const FLAT_NORMAL = { r: 128, g: 128, b: 255 };

/** How far a tier's simplified triangle count may miss its target before
 *  `bakeTier` refuses the build rather than ship a silently off-budget tier. */
const SIMPLIFY_TOLERANCE = 0.05;

export type MeshBuildTarget = {
  readonly key: string;
  /** One source GLB per tier this body ships; must be a contiguous prefix of
   *  `TIER_LADDER` starting at `small` (`orderedTiers` enforces it). */
  readonly glbPaths: Readonly<Partial<Record<Tier, string>>>;
  /** A tier present here is meshopt-simplified to this many triangles after
   *  merge; a tier absent (or absent from `glbPaths`) bakes at full density. */
  readonly tierTriangles?: Readonly<Partial<Record<Tier, number>>>;
  /** The CEILING tier's RAW_DATA upstream. */
  readonly source: string;
  readonly licence: string;
  readonly attribution: string;
  readonly bodyFromSource?: Mat3;
  /** Undefined for a floating source; see `meshGroundUpSource`. */
  readonly groundUp?: Vec3;
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
    // `mergeGeometry` walks the index run in strides of 3 and would read past
    // the end of a ragged one, silently emitting NaN-derived indices.
    const idx = prim.getIndices();
    const vertexRunLength = idx ? idx.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0);
    if (vertexRunLength % 3 !== 0) {
      throw new Error(
        `buildMeshes: ${key} has a primitive with ${vertexRunLength} indices — not a multiple of 3`,
      );
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
function transformNormal(
  m: readonly number[],
  mirrorSign: number,
  x: number,
  y: number,
  z: number,
): Vec3 {
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
  return normalize(
    mirrorSign * ((e * i - h * f) * x + (h * c - b * i) * y + (b * f - e * c) * z),
    mirrorSign * ((g * f - d * i) * x + (a * i - g * c) * y + (d * c - a * f) * z),
    mirrorSign * ((d * h - g * e) * x + (g * b - a * h) * y + (a * e - d * b) * z),
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
  const ox = vx - n[0] * dot;
  const oy = vy - n[1] * dot;
  const oz = vz - n[2] * dot;
  // A tangent parallel to the normal leaves nothing behind, and `normalize`
  // would hand the shader's Gram-Schmidt a zero vector (NaN). Same fallback as
  // `generateTangents`: any unit vector perpendicular to the normal.
  if (ox === 0 && oy === 0 && oz === 0) {
    return Math.abs(n[0]) < 0.9
      ? normalize(1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2])
      : normalize(0, n[2], -n[1]);
  }
  return normalize(ox, oy, oz);
}

/**
 * Whether a triangle's winding agrees with the authored NORMAL it interpolates.
 * A SketchUp two-sided face exports wound either way (a fifth of the
 * petunias' triangles disagree), so winding is normalised at bake time rather than trusted —
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
 * A primitive's own POSITION and index buffers, in local (pre-node-transform)
 * space — what `computeSmoothNormals` needs when NORMAL is missing; an
 * authored NORMAL is local for the same reason, until `transformNormal`
 * converts it below.
 */
function localGeometry(
  prim: Primitive,
  pos: Accessor,
): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(pos.getCount() * 3);
  for (let v = 0; v < pos.getCount(); v++) {
    const p = pos.getElement(v, [0, 0, 0]);
    positions[v * 3] = p[0]!;
    positions[v * 3 + 1] = p[1]!;
    positions[v * 3 + 2] = p[2]!;
  }
  const idx = prim.getIndices();
  const count = idx ? idx.getCount() : pos.getCount();
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = idx ? idx.getScalar(i) : i;
  return { positions, indices };
}

/**
 * Merge every primitive into one vertex/index buffer with node transforms — and
 * the source's optional body-frame remap — baked in, then RECENTRE on the
 * AREA-WEIGHTED SURFACE CENTROID of its triangles. A bbox centre would let a
 * long thin appendage (the whale's tail) drag the origin — and with it the
 * selection ring, pick sphere and caption anchor it all shares — off the
 * visible mass; weighting by triangle area keeps it on the surface instead.
 *
 * Recentring is also why `groundOffsetM` is measured HERE: after it the origin
 * sits inside the mesh, and this is the last place that knows how far the
 * lowest vertex fell below it.
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
    const mirrorSign = mirrored ? -1 : 1;
    const pos = prim.getAttribute('POSITION');
    const nrm = prim.getAttribute('NORMAL');
    const uv = prim.getAttribute('TEXCOORD_0');
    const tan = prim.getAttribute('TANGENT');
    if (!pos) throw new Error('buildMeshes: primitive without POSITION');
    const local = nrm ? null : localGeometry(prim, pos);
    const computedNormals = local ? computeSmoothNormals(local.positions, local.indices) : null;

    for (let v = 0; v < pos.getCount(); v++) {
      const p = pos.getElement(v, [0, 0, 0]);
      const world = transformPoint(matrix, p[0]!, p[1]!, p[2]!);
      positions.push(...world);

      const n = nrm
        ? nrm.getElement(v, [0, 0, 0])
        : [computedNormals![v * 3]!, computedNormals![v * 3 + 1]!, computedNormals![v * 3 + 2]!];
      const normal = transformNormal(matrix, mirrorSign, n[0]!, n[1]!, n[2]!);
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
  let minZ = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]! - cx;
    const y = positions[i + 1]! - cy;
    const z = positions[i + 2]! - cz;
    centred[i] = x;
    centred[i + 1] = y;
    centred[i + 2] = z;
    radiusSq = Math.max(radiusSq, x ** 2 + y ** 2 + z ** 2);
    minZ = Math.min(minZ, z);
  }

  const geometry = {
    positions: centred,
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    boundingRadiusM: Math.sqrt(radiusSq),
    // Seeding minZ at 0 is the >= 0 clamp; a centroid inside the convex hull
    // means a real minimum is never positive anyway.
    groundOffsetM: -minZ,
    centroidM: [cx, cy, cz] as Vec3,
  };
  return {
    ...geometry,
    tangents: authoredTangents ? new Float32Array(tangents) : generateTangents(geometry),
  };
}

/** What a texture slot bakes from: the source map, or the 1x1 standing in for it. */
type TextureSource = {
  readonly texture: Texture | null;
  readonly fallback: { r: number; g: number; b: number };
};

/**
 * Write one texture slot, resized into the budget. The sRGB slot is
 * colour-managed, the others are LINEAR data that must not be — sharp neither
 * converts colourspace nor embeds an ICC profile by default, and the fetcher's
 * `colorSpaceConversion: 'none'` is the matching half.
 */
async function writeTexture(
  texture: Texture | null,
  fallback: { r: number; g: number; b: number },
  path: string,
  px: number,
  lossless: boolean,
  forceR255 = false,
): Promise<void> {
  const image = texture?.getImage();
  const pipeline = image
    ? sharp(image).resize({
        width: px,
        height: px,
        fit: 'inside',
        withoutEnlargement: true,
      })
    : sharp({ create: { width: 1, height: 1, channels: 3, background: fallback } });
  await (forceR255 ? pipeline.linear([0, 1, 1], [255, 0, 0]) : pipeline)
    .webp(lossless ? LOSSLESS_WEBP : LOSSY_WEBP)
    .toFile(path);
}

/**
 * A per-tier record's present tiers, in ladder order — throws unless they form
 * a contiguous `TIER_LADDER` prefix starting at `small`: a gap (`small` +
 * `large`, no `medium`) would leave `clampTier` handing a `medium` request a
 * file that was never built, a silent 404. Generic over the record's value
 * (a built GLB path, or a `MeshSourceEntry`'s `MeshTierSource`) — only which
 * tier keys are present matters here.
 */
function orderedTiers<T>(tiers: Readonly<Partial<Record<Tier, T>>>, key: string): readonly Tier[] {
  const present = TIER_LADDER.filter((tier) => tiers[tier] !== undefined);
  if (present.length !== TIER_LADDER.indexOf(present[present.length - 1] ?? 'small') + 1) {
    throw new Error(
      `buildMeshes: ${key} ships tiers [${present.join(', ')}] — tiers must run contiguously from small`,
    );
  }
  return present;
}

/**
 * The prebake stamps `extras.aoGroundUp` on the one node it baked against a
 * ground plane; absent on a floating source, or on one not yet re-baked.
 */
function readGroundUpStamp(doc: Document): Vec3 | undefined {
  for (const node of doc.getRoot().listNodes()) {
    const stamp = node.getExtras().aoGroundUp;
    if (stamp !== undefined) return stamp as Vec3;
  }
  return undefined;
}

/** Same prebake stamp mechanism as `readGroundUpStamp`, the glTF-frame decal
 *  `buildMeshes` remaps into the body frame below. */
function readContactDecalStamp(doc: Document): ContactDecalStamp | undefined {
  for (const node of doc.getRoot().listNodes()) {
    const stamp = node.getExtras().contactDecal;
    if (stamp !== undefined) return stamp as ContactDecalStamp;
  }
  return undefined;
}

/** `undefined` on both sides is agreement, not a missing value to diff. */
function groundUpDiffers(stamp: Vec3 | undefined, expected: Vec3 | undefined): boolean {
  if (stamp === undefined || expected === undefined) return stamp !== expected;
  return stamp.some((c, i) => Math.abs(c - expected[i]!) > 1e-6);
}

function formatGroundUp(v: Vec3 | undefined): string {
  return v ? `[${v.join(', ')}]` : 'none';
}

/**
 * `centre` is a point (remap, then the same centroid shift `mergeGeometry`
 * applied to the vertices); `u`/`v` are half-axes, so only the remap applies.
 */
function bakeContactDecal(
  stamp: ContactDecalStamp,
  bodyFromSource: Mat3 | undefined,
  centroidM: Vec3,
): ContactDecal {
  const centre = rotateVec3ByTightMat3(stamp.centre, bodyFromSource);
  return {
    centre: [centre[0] - centroidM[0], centre[1] - centroidM[1], centre[2] - centroidM[2]],
    halfU: rotateVec3ByTightMat3(stamp.u, bodyFromSource),
    halfV: rotateVec3ByTightMat3(stamp.v, bodyFromSource),
  };
}

/**
 * Decimate a merged tier to its `tierTriangles` budget, if the tier has one —
 * geometry itself (positions/normals/uvs/tangents) is untouched, only
 * `indices` shrinks; `writeMeshBinary`'s reorder pass drops whatever that
 * leaves unreferenced. A miss past `SIMPLIFY_TOLERANCE` throws rather than
 * ship a tier silently off its triangle budget.
 */
async function simplifyTier(
  target: MeshBuildTarget,
  key: string,
  tier: Tier,
  geometry: Geometry,
): Promise<Geometry> {
  const targetTriangles = target.tierTriangles?.[tier];
  if (targetTriangles === undefined) return geometry;
  const sourceTriangles = geometry.indices.length / 3;
  const { indices, triangleCount } = await simplifyToTriangles(
    geometry.positions,
    geometry.uvs,
    geometry.indices,
    targetTriangles,
  );
  process.stderr.write(
    `  simplify ${key}-${tier}  ${sourceTriangles} -> ${triangleCount} tris (target ${targetTriangles})\n`,
  );
  const miss = Math.abs(triangleCount - targetTriangles) / targetTriangles;
  if (miss > SIMPLIFY_TOLERANCE) {
    throw new Error(
      `buildMeshes: ${key}-${tier} simplified to ${triangleCount} tris, missing its ` +
        `${targetTriangles}-tri target by ${(miss * 100).toFixed(1)}% (over ${(SIMPLIFY_TOLERANCE * 100).toFixed(0)}%)`,
    );
  }
  return { ...geometry, indices };
}

/**
 * Bake one tier's GLB: geometry to `<key>-<tier>.mesh`, every texture slot to
 * `<key>-<tier><suffix>.webp` capped at that tier's `tierToTexturePx`. The
 * contact mask is UNTIERED and only ever written for the ceiling tier — the
 * caller passes `bakeContact: false` for every other tier so a two-tier body
 * still ends up with exactly one `<key>_contact.webp`.
 */
async function bakeTier(
  target: MeshBuildTarget,
  tier: Tier,
  glbPath: string,
  outDir: string,
  bakeContact: boolean,
): Promise<BakeTierResult> {
  const { key } = target;
  const doc = await new NodeIO().read(glbPath);
  const stamp = readGroundUpStamp(doc);
  if (groundUpDiffers(stamp, target.groundUp)) {
    throw new Error(
      `buildMeshes: ${key} was prebaked for ground ${formatGroundUp(stamp)}, the scene seats it ` +
        `on ${formatGroundUp(target.groundUp)} — re-run npm run prebake-mesh -- ${key}`,
    );
  }
  const decalStamp = readContactDecalStamp(doc);
  if ((decalStamp === undefined) !== (stamp === undefined)) {
    const missing = decalStamp === undefined ? 'contactDecal' : 'aoGroundUp';
    throw new Error(
      `buildMeshes: ${key} has one of aoGroundUp/contactDecal without the other (missing ${missing})`,
    );
  }
  deRig(doc);
  const material = soleMaterial(doc, key);

  const triangles = countTriangles(doc);
  if (triangles > MESH_TRIANGLE_BUDGET) {
    throw new Error(
      `buildMeshes: ${key} has ${triangles} tris, over MESH_TRIANGLE_BUDGET ` +
        `(${MESH_TRIANGLE_BUDGET}); re-run npm run prebake-mesh -- ${key}`,
    );
  }

  const merged = mergeGeometry(doc, target.bodyFromSource);
  const geometry = await simplifyTier(target, key, tier, merged);
  const px = tierToTexturePx(tier);
  const stem = basename(meshTierPrefix(key, tier));
  writeFileSync(join(outDir, `${stem}.mesh`), Buffer.from(await writeMeshBinary(geometry)));

  const contactDecal =
    bakeContact && decalStamp !== undefined
      ? bakeContactDecal(decalStamp, target.bodyFromSource, geometry.centroidM)
      : undefined;
  if (contactDecal !== undefined) {
    const contactSourcePath = glbPath.replace(/\.glb$/, '.contact.png');
    if (!existsSync(contactSourcePath)) {
      throw new Error(`buildMeshes: ${key} has a contactDecal but no file at ${contactSourcePath}`);
    }
    await sharp(contactSourcePath)
      .toColourspace('b-w')
      .resize({
        width: CONTACT_SIZE_BUDGET,
        height: CONTACT_SIZE_BUDGET,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp(LOSSY_WEBP)
      .toFile(join(outDir, `${key}_contact.webp`));
  }

  const factor = material.getBaseColorFactor();
  const baseColorTexture = material.getBaseColorTexture();
  const metalRoughTexture = material.getMetallicRoughnessTexture();
  // The ORM convention: a prebake packs baked occlusion into R of the SAME
  // texture it packs roughness/metallic into. Any other pairing (or none) has
  // no occlusion bake behind it, so R must not carry through whatever the
  // source image happened to leave there.
  const occlusionPacked =
    metalRoughTexture !== null && material.getOcclusionTexture() === metalRoughTexture;
  const sources: Record<MeshTextureField, TextureSource> = {
    albedo: {
      texture: baseColorTexture,
      fallback: srgbByte(factor[0], factor[1], factor[2]),
    },
    metalRough: {
      texture: metalRoughTexture,
      // glTF packs roughness in G and metallic in B; R is glTF's occlusion.
      fallback: {
        r: 255,
        g: Math.round(material.getRoughnessFactor() * 255),
        b: Math.round(material.getMetallicFactor() * 255),
      },
    },
    normalMap: { texture: material.getNormalTexture(), fallback: FLAT_NORMAL },
  };

  // Captured from the loop so the read-back below is never a second spelling
  // of the albedo suffix.
  let albedoPath = '';
  for (const slot of MESH_TEXTURE_SLOTS) {
    const { texture, fallback } = sources[slot.field];
    const path = join(outDir, `${stem}${slot.suffix}.webp`);
    if (slot.field === 'albedo') albedoPath = path;
    await writeTexture(
      texture,
      fallback,
      path,
      px,
      !slot.format.endsWith('-srgb'),
      slot.field === 'metalRough' && !occlusionPacked,
    );
  }

  const substituted = MESH_TEXTURE_SLOTS.filter((slot) => sources[slot.field].texture === null).map(
    (slot) => slot.field,
  );
  for (const field of substituted) {
    const { r, g, b } = sources[field].fallback;
    console.warn(
      `buildMeshes: ${key} has no ${field} map — substituting 1x1 rgb(${r}, ${g}, ${b})`,
    );
  }

  const { data, info } = await sharp(albedoPath).raw().toBuffer({ resolveWithObject: true });
  // glTF's base colour is factor x texture, so the glint's colour is too. The
  // 1x1 substitute already carries the factor, hence the guard.
  const mean = meanAlbedo(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
  ).map((c, i) => (baseColorTexture ? c * factor[i]! : c)) as Vec3;

  return {
    geometry,
    substituted,
    mean: mean.map((c) => Number(c.toFixed(6))) as Vec3,
    contactDecal,
  };
}

/**
 * Bake every tier a source ships. Row metrics (bounding radius, ground offset,
 * mean albedo, triangle count, substituted list) and the contact decal come
 * from the CEILING tier ONLY — a decimated `small` tier could otherwise seat a
 * rover at a different height per tier, an asymmetry the row must not carry.
 */
async function bake(target: MeshBuildTarget, outDir: string): Promise<MeshAssetRow> {
  const { key } = target;
  const tiers = orderedTiers(target.glbPaths, key);
  const ceiling = tiers[tiers.length - 1]!;

  // `tiers` is ladder-ordered (`orderedTiers`), so the last iteration is
  // always the ceiling — no need to track which pass that was separately.
  let result: BakeTierResult | undefined;
  for (const tier of tiers) {
    result = await bakeTier(target, tier, target.glbPaths[tier]!, outDir, tier === ceiling);
  }
  const { geometry, substituted, mean, contactDecal } = result!;

  return {
    key,
    boundingRadiusM: geometry.boundingRadiusM,
    groundOffsetM: geometry.groundOffsetM,
    meanAlbedo: mean,
    triangleCount: geometry.indices.length / 3,
    substituted,
    contactDecal,
    source: target.source,
    licence: target.licence,
    attribution: target.attribution,
    tierCeiling: ceiling,
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

/**
 * Prettier's `printWidth: 100` break — after the colon, since it cannot split a
 * string literal. `format:check` runs over this generated file, so emitting
 * anything else makes a fresh bake fail the format gate.
 */
function field(name: string, value: string): string {
  const flat = `    ${name}: ${value},`;
  return flat.length <= 100 || value.includes('\n') ? flat : `    ${name}:\n      ${value},`;
}

/** Prettier leaves comments alone, so the continuation indent is ours to hold. */
function docBlock(lines: readonly string[]): string {
  return `${lines.map((line, i) => (i === 0 ? `  /** ${line}` : `   *  ${line}`)).join('\n')} */\n`;
}

/** Exported for the round-trip test that pins the committed table to this output. */
export function serializeMeshAssets(rows: readonly MeshAssetRow[]): string {
  const body = rows
    .map((row) =>
      [
        `  ${/^[A-Za-z_$][\w$]*$/.test(row.key) ? row.key : quote(row.key)}: {`,
        // An optional field whose row value is absent emits no line at all —
        // a floating mesh's row stays byte-identical whether or not the
        // column exists, rather than growing a `contactDecal: undefined,`.
        ...MESH_ASSET_ROW_FIELDS.flatMap((f) => {
          const value = f.emit(row);
          return value === undefined ? [] : [field(f.name, value)];
        }),
        '  },',
      ].join('\n'),
    )
    .join('\n');
  const rowType = MESH_ASSET_ROW_FIELDS.map(
    (f) =>
      (f.doc ? docBlock(f.doc) : '') +
      `  readonly ${f.name}${f.optional ? '?' : ''}: ${f.tsType};\n`,
  ).join('');
  return (
    GENERATED_BANNER +
    "import type { Vec3 } from '../../@types/math/Vec3';\n" +
    "import type { ContactDecal } from '../../@types/data/mesh/ContactDecal';\n" +
    "import type { MeshTextureField } from '../../@types/data/mesh/MeshTextureField';\n" +
    "import type { Tier } from '../../@types/data/Tier';\n" +
    '\n' +
    `export type MeshAssetRow = {\n${rowType}};\n` +
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
      `  ok   ${row.key}  ceiling=${row.tierCeiling}  ${row.triangleCount} tris  ` +
        `r=${row.boundingRadiusM.toFixed(3)} m  ground=${row.groundOffsetM.toFixed(3)} m\n`,
    );
  }

  writeFileSync(options.generatedPath, serializeMeshAssets(rows));
  process.stderr.write(`  ok   meshAssets.generated.ts  (${rows.length} meshes)\n`);
  return rows;
}

async function main(): Promise<void> {
  const targets = Object.entries(MESH_SOURCES).map(([key, entry]) => {
    const present = orderedTiers(entry.tiers, key);
    const glbPaths = Object.fromEntries(
      present.map((tier) => [tier, rawDataPath(entry.tiers[tier]!.raw)]),
    ) as MeshBuildTarget['glbPaths'];
    const tierTriangles = Object.fromEntries(
      present
        .filter((tier) => entry.tiers[tier]!.triangles !== undefined)
        .map((tier) => [tier, entry.tiers[tier]!.triangles]),
    ) as MeshBuildTarget['tierTriangles'];
    const raw: RawDataEntry = RAW_DATA[entry.tiers[present[present.length - 1]!]!.raw];
    return {
      key,
      glbPaths,
      tierTriangles,
      source: raw.upstream ?? raw.path,
      licence: entry.licence,
      attribution: entry.attribution,
      bodyFromSource: entry.bodyFromSource,
      groundUp: meshGroundUpSource(key),
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
