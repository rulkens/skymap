import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Document, NodeIO, type Material, type Primitive } from '@gltf-transform/core';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { decodeMesh, type DecodedMeshGeometry } from '../../../src/data/mesh/meshBinaryFormat';
import { MESH_TEXTURE_SLOTS } from '../../../src/data/mesh/meshTextureSlots';
import { buildMeshes } from '../../../tools/meshes/buildMeshes';
import { expectDirectionNear } from '../../helpers/meshes/expectDirectionNear';
import { expectPositionNear } from '../../helpers/meshes/expectPositionNear';

// Every fixture is synthesised here rather than read from data/raw/meshes:
// the real sources are gitignored downloads that only exist after the human
// approval gate, so a test that touched them would be red on a fresh clone.

/** One triangle at `x`, so two of them can never weld into each other. */
function addTriangle(doc: Document, material: Material, x: number): Primitive {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const accessor = (type: 'VEC3' | 'VEC2', array: Float32Array<ArrayBuffer>) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0])))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array([0, 0, 1, 0, 0, 1])))
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array([0, 1, 2]))
        .setBuffer(buffer),
    )
    .setMaterial(material);
}

/** A primitive with hand-authored attributes, for the transform fixtures. */
function addPrim(
  doc: Document,
  material: Material,
  data: {
    positions: number[];
    normals: number[];
    tangents?: number[];
    indices?: number[];
  },
): Primitive {
  const buffer = doc.getRoot().listBuffers()[0]!;
  const count = data.positions.length / 3;
  const accessor = (type: 'VEC4' | 'VEC3' | 'VEC2', array: number[]) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', data.positions))
    .setAttribute('NORMAL', accessor('VEC3', data.normals))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Array<number>(count * 2).fill(0)))
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint32Array(data.indices ?? [...Array(count).keys()]))
        .setBuffer(buffer),
    )
    .setMaterial(material);
  if (data.tangents) prim.setAttribute('TANGENT', accessor('VEC4', data.tangents));
  return prim;
}

/**
 * The first triangle's geometric normal dotted with its first vertex's normal:
 * positive when the winding agrees with the shading. The writer may reorder and
 * rotate triangles, so winding is judged by facing, never by index order.
 */
function faceFacing(decoded: DecodedMeshGeometry): number {
  const [a, b, c] = [0, 1, 2].map((k) => {
    const v = decoded.indices[k]!;
    return [0, 1, 2].map((i) => decoded.positions[v * 3 + i]!);
  }) as [number[], number[], number[]];
  const e1 = [0, 1, 2].map((i) => b[i]! - a[i]!);
  const e2 = [0, 1, 2].map((i) => c[i]! - a[i]!);
  const face = [
    e1[1]! * e2[2]! - e1[2]! * e2[1]!,
    e1[2]! * e2[0]! - e1[0]! * e2[2]!,
    e1[0]! * e2[1]! - e1[1]! * e2[0]!,
  ];
  const n = decoded.indices[0]! * 3;
  return face.reduce((sum, f, i) => sum + f * decoded.normals[n + i]!, 0);
}

/** Assert `expected` is *some* decoded vertex's position: the writer's vertex-cache
 * reorder means source index order no longer matches decoded index order. */
function expectVertexNear(
  file: ArrayBuffer,
  decoded: DecodedMeshGeometry,
  expected: number[],
): void {
  let best = 0;
  let bestDist = Infinity;
  for (let v = 0; v < decoded.vertexCount; v++) {
    const dist = Math.hypot(...[0, 1, 2].map((c) => decoded.positions[v * 3 + c]! - expected[c]!));
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  expectPositionNear(
    file,
    [0, 1, 2].map((c) => decoded.positions[best * 3 + c]!),
    expected,
  );
}

async function solidPng(r: number, g: number, b: number): Promise<Uint8Array> {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

/** Attach a baseColour map so the fixture has an albedo to average. */
async function withBaseColour(doc: Document, material: Material): Promise<Material> {
  const image = await solidPng(255, 0, 0);
  return material.setBaseColorTexture(
    doc.createTexture('albedo').setImage(image).setMimeType('image/png'),
  );
}

/** ...plus the other two maps, so the fixture substitutes nothing. */
async function withEveryMap(doc: Document, material: Material): Promise<Material> {
  const texture = async (name: string, r: number, g: number, b: number) =>
    doc
      .createTexture(name)
      .setImage(await solidPng(r, g, b))
      .setMimeType('image/png');
  return (await withBaseColour(doc, material))
    .setNormalTexture(await texture('normal', 128, 128, 255))
    .setMetallicRoughnessTexture(await texture('mr', 0, 255, 0));
}

let dir: string;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buildMeshes-'));
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function writeGlb(doc: Document): Promise<string> {
  const glbPath = join(dir, 'source.glb');
  await new NodeIO().write(glbPath, doc);
  return glbPath;
}

/** Node's Buffer is a view into a shared pool — hand decodeMesh only its own bytes. */
function readMesh(): ArrayBuffer {
  const bytes = readFileSync(join(dir, 'out', 'testmesh.mesh'));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function run(glbPath: string, bodyFromSource?: Mat3, groundUp?: Vec3) {
  return buildMeshes({
    targets: [
      {
        key: 'testmesh',
        glbPath,
        source: 'https://example.invalid/model',
        licence: 'CC BY 4.0',
        attribution: 'A. Modeller — https://example.invalid/author',
        bodyFromSource,
        groundUp,
      },
    ],
    outDir: join(dir, 'out'),
    generatedPath: join(dir, 'meshAssets.generated.ts'),
  });
}

describe('buildMeshes()', () => {
  it('refuses a two-material GLB', async () => {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene('s');
    for (const [i, name] of ['a', 'b'].entries()) {
      const material = await withBaseColour(doc, doc.createMaterial(name));
      const mesh = doc.createMesh(name).addPrimitive(addTriangle(doc, material, i * 4));
      scene.addChild(doc.createNode(name).setMesh(mesh));
    }

    await expect(run(await writeGlb(doc))).rejects.toThrow(/material/i);
  });

  it('refuses a GLB prebaked for a different ground than the scene seats it on', async () => {
    const stamped = new Document();
    stamped.createBuffer();
    const stampedMaterial = await withBaseColour(stamped, stamped.createMaterial('one'));
    const stampedMesh = stamped
      .createMesh('m')
      .addPrimitive(addTriangle(stamped, stampedMaterial, 0));
    const stampedNode = stamped
      .createNode('n')
      .setMesh(stampedMesh)
      .setExtras({ aoGroundUp: [0, 1, 0] });
    stamped.createScene('s').addChild(stampedNode);

    // Stamped for a ground, but the scene (no `groundUp` passed) floats it.
    await expect(run(await writeGlb(stamped))).rejects.toThrow(
      /prebaked for ground \[0, 1, 0\], the scene seats it on none/,
    );
    // Seated on both sides, but on different grounds.
    await expect(run(await writeGlb(stamped), undefined, [0, 0, 1])).rejects.toThrow(
      /prebaked for ground \[0, 1, 0\], the scene seats it on \[0, 0, 1\]/,
    );

    const unstamped = new Document();
    unstamped.createBuffer();
    const unstampedMaterial = await withBaseColour(unstamped, unstamped.createMaterial('one'));
    const unstampedMesh = unstamped
      .createMesh('m')
      .addPrimitive(addTriangle(unstamped, unstampedMaterial, 0));
    unstamped.createScene('s').addChild(unstamped.createNode('n').setMesh(unstampedMesh));

    // The reverse: never baked against a ground, but the scene seats it.
    await expect(run(await writeGlb(unstamped), undefined, [0, 1, 0])).rejects.toThrow(
      /prebaked for ground none, the scene seats it on \[0, 1, 0\]/,
    );
  });

  it('merges several primitives sharing one material', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const mesh = doc
      .createMesh('m')
      .addPrimitive(addTriangle(doc, material, 0))
      .addPrimitive(addTriangle(doc, material, 4));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    const row = (await run(await writeGlb(doc)))[0]!;

    const decoded = await decodeMesh(readMesh());
    expect(decoded.vertexCount).toBe(6);
    expect(decoded.indexCount).toBe(6);
    expect(row.triangleCount).toBe(2);
  });

  it('drops skin attributes and bakes the rest pose', async () => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const prim = addTriangle(doc, material, 0)
      .setAttribute(
        'JOINTS_0',
        doc
          .createAccessor()
          .setType('VEC4')
          .setArray(new Uint8Array(12))
          .setBuffer(buffer)
          .setNormalized(false),
      )
      .setAttribute(
        'WEIGHTS_0',
        doc
          .createAccessor()
          .setType('VEC4')
          .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))
          .setBuffer(buffer),
      );
    const mesh = doc.createMesh('m').addPrimitive(prim);
    const joint = doc.createNode('joint');
    const node = doc.createNode('n').setMesh(mesh).setSkin(doc.createSkin('sk').addJoint(joint));
    doc.createScene('s').addChild(node).addChild(joint);

    const row = (await run(await writeGlb(doc)))[0]!;

    const decoded = await decodeMesh(readMesh());
    expect(decoded.vertexCount).toBe(3);
    // The joint/weight attributes left without taking the rest of the vertex.
    expect([...decoded.uvs]).toEqual([0, 0, 1, 0, 0, 1]);
    for (let v = 0; v < 3; v++)
      expectDirectionNear(decoded.normals.slice(v * 3, v * 3 + 3), [0, 0, 1]);
    expect(row.attribution).toBe('A. Modeller — https://example.invalid/author');
  });

  it('bakes a rotated, non-uniformly scaled parent node into the vertices', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const s = Math.SQRT1_2;
    const diagonal = [s, s, 0, 1, s, s, 0, 1, s, s, 0, 1];
    const mesh = doc
      .createMesh('m')
      .addPrimitive(
        addPrim(doc, material, {
          positions: [1, 0, 0, 0, 1, 0, 0, 0, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          tangents: diagonal,
        }),
      )
      .addPrimitive(
        addPrim(doc, material, {
          positions: [2, 0, 0, 0, 0, 0, 0, 0, 1],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          tangents: diagonal,
        }),
      );
    // 90 deg about Z on top of a 2/3/1 scale: x -> +2y, y -> -3x, z -> z.
    const parent = doc.createNode('parent').setRotation([0, 0, s, s]).setScale([2, 3, 1]);
    parent.addChild(doc.createNode('child').setMesh(mesh));
    doc.createScene('s').addChild(parent);

    const row = (await run(await writeGlb(doc)))[0]!;
    const decoded = await decodeMesh(readMesh());

    // (1,0,0) -> (0,2,0) and (0,1,0) -> (-3,0,0); third vertex of each triangle
    // stays (0,0,0). Triangle A = (0,2,0),(-3,0,0),(0,0,0), area 3, own centroid
    // (-1, 2/3, 0). Triangle B = (0,4,0),(0,0,0),(0,0,1), area 2, own centroid
    // (0, 4/3, 1/3). Area-weighted: (3*A + 2*B) / 5 = (-3/5, 14/15, 2/15).
    expectVertexNear(readMesh(), decoded, [0.6, 16 / 15, -2 / 15]);
    expectVertexNear(readMesh(), decoded, [-2.4, -14 / 15, -2 / 15]);
    expectDirectionNear(decoded.normals.slice(0, 3), [0, 0, 1]);
    // The tangent takes the PLAIN 3x3 — (1,1,0) -> (-3,2,0) normalised. Running
    // it through the cofactor matrix normals use would give (-2,3,0) instead.
    expectDirectionNear(decoded.tangents.slice(0, 4), [-0.83205, 0.5547, 0, 1]);
    // Farthest vertex from the centroid is (0,4,0), at distance sqrt(2201)/15.
    expect(row.boundingRadiusM).toBeCloseTo(Math.sqrt(2201) / 15, 4);
  });

  it('reorients every attribute through the source-to-body remap', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const prim = addPrim(doc, material, {
      // A normal off the triangle's own plane and a tangent across it, so a
      // remap applied to positions alone — or transposed — cannot pass.
      positions: [1, 0, 0, 0, 1, 0, 0, 0, 0],
      normals: [0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8],
      tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
    });
    doc
      .createScene('s')
      .addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)));

    // 90 deg about Z: x -> +y, y -> -x.
    await run(await writeGlb(doc), [0, 1, 0, -1, 0, 0, 0, 0, 1]);
    const decoded = await decodeMesh(readMesh());

    // (1,0,0) -> (0,1,0), (0,1,0) -> (-1,0,0), (0,0,0) -> (0,0,0). One triangle,
    // so its area-weighted centroid is just the plain vertex average: (-1/3, 1/3, 0).
    expectVertexNear(readMesh(), decoded, [1 / 3, 2 / 3, 0]);
    expectVertexNear(readMesh(), decoded, [-2 / 3, -1 / 3, 0]);
    expectDirectionNear(decoded.normals.slice(0, 3), [-0.6, 0, 0.8]);
    expectDirectionNear(decoded.tangents.slice(0, 4), [0, 1, 0, 1]);
  });

  it('flips normals, handedness and winding for a mirrored node', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const prim = addPrim(doc, material, {
      positions: [1, 0, 0, 0, 1, 0, 0, 0, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
      indices: [0, 1, 2],
    });
    const node = doc
      .createNode('n')
      .setMesh(doc.createMesh('m').addPrimitive(prim))
      .setScale([-1, 1, 1]);
    doc.createScene('s').addChild(node);

    await run(await writeGlb(doc));
    const decoded = await decodeMesh(readMesh());

    // (1,0,0) -> (-1,0,0), (0,1,0) -> (0,1,0), (0,0,0) -> (0,0,0). One triangle,
    // so its area-weighted centroid is the plain vertex average: (-1/3, 1/3, 0).
    expectVertexNear(readMesh(), decoded, [-2 / 3, -1 / 3, 0]);
    // The cofactor matrix alone hands back (0,0,-1) here — a mirrored node needs
    // the determinant's sign put back, or every normal points into the surface.
    expectDirectionNear(decoded.normals.slice(0, 3), [0, 0, 1]);
    expectDirectionNear(decoded.tangents.slice(0, 4), [-1, 0, 0, -1]);
    expect(faceFacing(decoded)).toBeGreaterThan(0);
  });

  it('rewinds a triangle whose order disagrees with its authored normal', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    // Clockwise seen from +Z, yet every normal points +Z — a SketchUp two-sided
    // face, which under back-face culling would be the side the camera loses.
    const prim = addPrim(doc, material, {
      positions: [0, 0, 0, 0, 1, 0, 1, 0, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    });
    doc
      .createScene('s')
      .addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)));

    await run(await writeGlb(doc));

    expect(faceFacing(await decodeMesh(readMesh()))).toBeGreaterThan(0);
  });

  it('recentres an off-origin authored pivot instead of inflating the radius', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 1000));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    const row = (await run(await writeGlb(doc)))[0]!;

    // The triangle's own centroid — (1000+1001+1000)/3, (0+0+1)/3 — not its
    // ~1000 m distance from the origin.
    expectVertexNear(readMesh(), await decodeMesh(readMesh()), [-1 / 3, -1 / 3, 0]);
    expect(row.boundingRadiusM).toBeCloseTo(Math.sqrt(5) / 3, 4);
  });

  it('weights the recentre by triangle area, not by the bbox extremes', async () => {
    // A body (area 8) plus a sliver (area 0.5) placed far away. A bbox centre
    // is dragged toward the sliver's ~100 m coordinate — exactly the whale's-
    // tail failure mode; the area-weighted centroid barely moves for it.
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const body = addPrim(doc, material, {
      positions: [0, 0, 0, 4, 0, 0, 0, 4, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    });
    const sliver = addPrim(doc, material, {
      positions: [100, 0, 0, 101, 0, 0, 100, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    });
    const mesh = doc.createMesh('m').addPrimitive(body).addPrimitive(sliver);
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    await run(await writeGlb(doc));
    const decoded = await decodeMesh(readMesh());

    // Body centroid (4/3, 4/3, 0) at area 8; sliver centroid (301/3, 1/3, 0) at
    // area 0.5. Weighted: (8*(4/3) + 0.5*(301/3)) / 8.5 = 365/51, and
    // (8*(4/3) + 0.5*(1/3)) / 8.5 = 65/51 — nowhere near the bbox centre of
    // (50.5, 2, 0) a naive min/max midpoint would give.
    expectVertexNear(readMesh(), decoded, [-365 / 51, -65 / 51, 0]);
    expectVertexNear(readMesh(), decoded, [100 - 365 / 51, -65 / 51, 0]);
  });

  it('ignores geometry orphaned off the scene graph', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));
    // A second material, reachable from no scene: an exporter leftover must not
    // contribute vertices, nor trip the one-material refusal.
    const orphanMaterial = await withBaseColour(doc, doc.createMaterial('orphan'));
    doc
      .createNode('orphan')
      .setMesh(doc.createMesh('om').addPrimitive(addTriangle(doc, orphanMaterial, 8)));

    const row = (await run(await writeGlb(doc)))[0]!;

    expect((await decodeMesh(readMesh())).vertexCount).toBe(3);
    expect(row.triangleCount).toBe(1);
  });

  it('keeps an authored TANGENT instead of regenerating one', async () => {
    // The authored frame deliberately disagrees with the UV gradient (which
    // would give +X): regenerating over a good frame is a silent way to break
    // normal-mapped shading on an asset that was already correct.
    const doc = new Document();
    const buffer = doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const prim = addTriangle(doc, material, 0).setAttribute(
      'TANGENT',
      doc
        .createAccessor()
        .setType('VEC4')
        .setArray(new Float32Array([0, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, -1]))
        .setBuffer(buffer),
    );
    doc
      .createScene('s')
      .addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(prim)));

    await run(await writeGlb(doc));

    expectDirectionNear((await decodeMesh(readMesh())).tangents.slice(0, 4), [0, 1, 0, -1]);
  });

  it('substitutes a flat normal and a constant mr map when the source has neither', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('baseColourOnly'));
    material.setMetallicFactor(0).setRoughnessFactor(1);
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    const row = (await run(await writeGlb(doc)))[0]!;

    expect(row.substituted).toEqual(['metalRough', 'normalMap']);
    const normalPx = await sharp(join(dir, 'out', 'testmesh_normal.png'))
      .raw()
      .toBuffer();
    const mrPx = await sharp(join(dir, 'out', 'testmesh_mr.png'))
      .raw()
      .toBuffer();
    expect([...normalPx.subarray(0, 3)]).toEqual([128, 128, 255]);
    // glTF packs roughness in G and metallic in B; the material set 1 and 0.
    // R is glTF's occlusion — 255 (no occlusion) absent a packed AO bake.
    expect([...mrPx.subarray(0, 3)]).toEqual([255, 255, 0]);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/testmesh/);
    // Pure red albedo — the mean the glint fallback reads back.
    expect(row.meanAlbedo).toEqual([1, 0, 0]);
    expect(readFileSync(join(dir, 'meshAssets.generated.ts'), 'utf8')).toContain(
      "path: 'meshes/testmesh.mesh'",
    );
  });

  it('leaves substituted empty when the source carries every map', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withEveryMap(doc, doc.createMaterial('everyMap'));
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    const row = (await run(await writeGlb(doc)))[0]!;

    expect(row.substituted).toEqual([]);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/substituting/);
  });

  it('writes R = 255 when the mr texture carries no occlusion', async () => {
    const doc = new Document();
    doc.createBuffer();
    // withEveryMap's mr texture is solid rgb(0, 255, 0) with no occlusionTexture.
    const material = await withEveryMap(doc, doc.createMaterial('everyMap'));
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    await run(await writeGlb(doc));

    const mrPx = await sharp(join(dir, 'out', 'testmesh_mr.png'))
      .raw()
      .toBuffer();
    expect([...mrPx.subarray(0, 3)]).toEqual([255, 255, 0]);
  });

  it('keeps R when occlusion is packed into the mr texture', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('packedOcclusion'));
    // Same Texture object on both slots — the ORM convention a real prebake emits.
    const orm = doc
      .createTexture('orm')
      .setImage(await solidPng(77, 255, 0))
      .setMimeType('image/png');
    material.setMetallicRoughnessTexture(orm).setOcclusionTexture(orm);
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    await run(await writeGlb(doc));

    const mrPx = await sharp(join(dir, 'out', 'testmesh_mr.png'))
      .raw()
      .toBuffer();
    expect([...mrPx.subarray(0, 3)]).toEqual([77, 255, 0]);
  });

  it('writes every MESH_TEXTURE_SLOTS suffix, so a slot added to the table lands on disk', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    await run(await writeGlb(doc));

    for (const slot of MESH_TEXTURE_SLOTS) {
      expect(existsSync(join(dir, 'out', `testmesh${slot.suffix}.png`))).toBe(true);
    }
  });

  it('reports groundOffsetM as the drop from the origin to the lowest vertex', async () => {
    // A cube spanning [-1, 1] on every axis: its area-weighted surface centroid
    // is the origin, so the lowest vertex sits exactly 1 m below it.
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('one'));
    const s = 1 / Math.sqrt(3);
    const corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ];
    const cube = addPrim(doc, material, {
      positions: corners.flat(),
      normals: corners.flat().map((c) => c * s),
      indices: [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1,
        2, 6, 1, 6, 5,
      ],
    });
    doc
      .createScene('s')
      .addChild(doc.createNode('n').setMesh(doc.createMesh('m').addPrimitive(cube)));

    const row = (await run(await writeGlb(doc)))[0]!;

    expect(row.groundOffsetM).toBeCloseTo(1, 5);
  });
});
