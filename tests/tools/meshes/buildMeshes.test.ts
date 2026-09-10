import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Document, NodeIO, type Material, type Primitive } from '@gltf-transform/core';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeMesh } from '../../../src/data/mesh/meshBinaryFormat';
import { buildMeshes } from '../../../tools/meshes/buildMeshes';

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

function near(actual: ArrayLike<number>, expected: number[]): void {
  expected.forEach((e, i) => expect(actual[i]).toBeCloseTo(e, 4));
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

function run(glbPath: string) {
  return buildMeshes({
    targets: [
      {
        key: 'testmesh',
        glbPath,
        source: 'https://example.invalid/model',
        licence: 'CC BY 4.0',
        attribution: 'A. Modeller — https://example.invalid/author',
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

    const decoded = decodeMesh(readMesh());
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

    const decoded = decodeMesh(readMesh());
    expect(decoded.vertexCount).toBe(3);
    // The joint/weight attributes left without taking the rest of the vertex.
    expect([...decoded.uvs]).toEqual([0, 0, 1, 0, 0, 1]);
    expect([...decoded.normals]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
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
    const decoded = decodeMesh(readMesh());

    near(decoded.positions.slice(0, 6), [0, 2, 0, -3, 0, 0]);
    near(decoded.normals.slice(0, 3), [0, 0, 1]);
    // The tangent takes the PLAIN 3x3 — (1,1,0) -> (-3,2,0) normalised. Running
    // it through the cofactor matrix normals use would give (-2,3,0) instead.
    near(decoded.tangents.slice(0, 4), [-0.83205, 0.5547, 0, 1]);
    // Furthest vertex is prim 2's (2,0,0) -> (0,4,0).
    expect(row.boundingRadiusM).toBeCloseTo(4, 4);
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
    const decoded = decodeMesh(readMesh());

    near(decoded.positions.slice(0, 3), [-1, 0, 0]);
    // The cofactor matrix alone hands back (0,0,-1) here — a mirrored node needs
    // the determinant's sign put back, or every normal points into the surface.
    near(decoded.normals.slice(0, 3), [0, 0, 1]);
    near(decoded.tangents.slice(0, 4), [-1, 0, 0, -1]);
    expect([...decoded.indices]).toEqual([0, 2, 1]);
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

    expect(decodeMesh(readMesh()).vertexCount).toBe(3);
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

    expect([...decodeMesh(readMesh()).tangents.slice(0, 4)]).toEqual([0, 1, 0, -1]);
  });

  it('substitutes a flat normal and a constant mr map when the source has neither', async () => {
    const doc = new Document();
    doc.createBuffer();
    const material = await withBaseColour(doc, doc.createMaterial('baseColourOnly'));
    material.setMetallicFactor(0).setRoughnessFactor(1);
    const mesh = doc.createMesh('m').addPrimitive(addTriangle(doc, material, 0));
    doc.createScene('s').addChild(doc.createNode('n').setMesh(mesh));

    const row = (await run(await writeGlb(doc)))[0]!;

    expect(row.normalMapSubstituted).toBe(true);
    const normalPx = await sharp(join(dir, 'out', 'testmesh_normal.png'))
      .raw()
      .toBuffer();
    const mrPx = await sharp(join(dir, 'out', 'testmesh_mr.png'))
      .raw()
      .toBuffer();
    expect([...normalPx.subarray(0, 3)]).toEqual([128, 128, 255]);
    // glTF packs roughness in G and metallic in B; the material set 1 and 0.
    expect([...mrPx.subarray(0, 3)]).toEqual([0, 255, 0]);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/testmesh/);
    // Pure red albedo — the mean the glint fallback reads back.
    expect(row.meanAlbedo).toEqual([1, 0, 0]);
    expect(readFileSync(join(dir, 'meshAssets.generated.ts'), 'utf8')).toContain(
      "path: 'meshes/testmesh.mesh'",
    );
  });
});
