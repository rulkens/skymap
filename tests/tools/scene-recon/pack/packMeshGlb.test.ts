/**
 * mesh.glb is the contract between the offline re-pack (packMeshGlb) and the
 * viewer (readMeshGlb) — spec §5 of the scene-workbench 3 mesh design. The
 * malformed inputs stand in for OpenMVS's own export, which a
 * `--max-texture-size` overflow splits into several primitives/textures; the
 * packer can never produce them, so the tests build them with gltf-transform
 * and re-write the GLB.
 */
import { describe, it, expect } from 'vitest';
import { Document, WebIO } from '@gltf-transform/core';
import {
  packMeshGlb,
  type TexturedMeshGeometry,
} from '../../../../tools/scene-recon/pack/packMeshGlb';
import { readMeshGlb } from '../../../../tools/scene-workbench/src/scene/readMeshGlb';

/** Two triangles sharing an edge; every value is exact in f32, so round-trips compare exactly. */
const QUAD: TexturedMeshGeometry = {
  positions: new Float32Array([-1.5, 0.25, 4.0, 2.5, 0.25, 4.0, 2.5, 3.75, 4.5, -1.5, 3.75, 4.5]),
  // u ≠ v at every vertex, so a swapped pair is visible.
  uvs: new Float32Array([0.125, 0.25, 0.875, 0.5, 0.625, 0.75, 0.375, 1.0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  image: {
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
    mimeType: 'image/png',
  },
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** Re-opens a packed GLB so a test can break the subset before handing it to the reader. */
async function packedDocument(): Promise<Document> {
  return new WebIO().readBinary(await packMeshGlb(QUAD));
}

const rewrite = async (doc: Document): Promise<ArrayBuffer> =>
  toArrayBuffer(await new WebIO().writeBinary(doc));

describe('packMeshGlb → readMeshGlb round-trips a textured mesh', () => {
  it('returns the packed geometry, image bytes and mime type unchanged', async () => {
    const glb = await packMeshGlb(QUAD);

    const geometry = await readMeshGlb(toArrayBuffer(glb));
    expect(Array.from(geometry.positions)).toEqual(Array.from(QUAD.positions));
    expect(Array.from(geometry.uvs)).toEqual(Array.from(QUAD.uvs));
    expect(Array.from(geometry.indices)).toEqual(Array.from(QUAD.indices));
    expect(Array.from(geometry.image.bytes)).toEqual(Array.from(QUAD.image.bytes));
    expect(geometry.image.mimeType).toBe('image/png');
  });

  it('stamps the frame note an external viewer cannot infer', async () => {
    const doc = await packedDocument();

    expect(doc.getRoot().getAsset().extras).toMatchObject({ frame: 'group ENU metres, +Z up' });
  });
});

describe('readMeshGlb resolves node transforms', () => {
  it('applies an ancestor node translation to the positions', async () => {
    const doc = await packedDocument();
    const scene = doc.getRoot().listScenes()[0]!;
    const meshNode = doc
      .getRoot()
      .listNodes()
      .find((node) => node.getMesh())!;
    const parent = doc.createNode('shifted').setTranslation([10, 0, 0]);
    scene.removeChild(meshNode);
    parent.addChild(meshNode);
    scene.addChild(parent);

    const geometry = await readMeshGlb(await rewrite(doc));
    for (let i = 0; i < QUAD.positions.length; i += 3) {
      expect(geometry.positions[i]).toBeCloseTo(QUAD.positions[i]! + 10, 5);
      expect(geometry.positions[i + 1]).toBeCloseTo(QUAD.positions[i + 1]!, 5);
      expect(geometry.positions[i + 2]).toBeCloseTo(QUAD.positions[i + 2]!, 5);
    }
  });
});

describe('readMeshGlb refuses what the viewer cannot draw', () => {
  it('refuses a mesh split into two primitives', async () => {
    const doc = await packedDocument();
    const mesh = doc.getRoot().listMeshes()[0]!;
    mesh.addPrimitive(mesh.listPrimitives()[0]!.clone());

    await expect(readMeshGlb(await rewrite(doc))).rejects.toThrow(/primitive/i);
  });

  it('refuses a second texture, naming the OpenMVS flag that caused the split', async () => {
    const doc = await packedDocument();
    const material = doc.getRoot().listMaterials()[0]!;
    material.setEmissiveTexture(doc.getRoot().listTextures()[0]!.clone());

    await expect(readMeshGlb(await rewrite(doc))).rejects.toThrow(/--max-texture-size/);
  });

  it('refuses a primitive without TEXCOORD_0', async () => {
    const doc = await packedDocument();
    doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setAttribute('TEXCOORD_0', null);

    await expect(readMeshGlb(await rewrite(doc))).rejects.toThrow(/TEXCOORD_0/);
  });
});
