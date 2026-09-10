import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
    expect(row.attribution).toBe('A. Modeller — https://example.invalid/author');
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
    expect(existsSync(join(dir, 'out', 'testmesh_normal.png'))).toBe(true);
    expect(existsSync(join(dir, 'out', 'testmesh_mr.png'))).toBe(true);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/testmesh/);
    // Pure red albedo — the mean the glint fallback reads back.
    expect(row.meanAlbedo).toEqual([1, 0, 0]);
    expect(readFileSync(join(dir, 'meshAssets.generated.ts'), 'utf8')).toContain(
      "path: 'meshes/testmesh.mesh'",
    );
  });
});
