/**
 * Writes `mesh.glb` — the glTF 2.0 subset spec §5 pins down: one scene, node,
 * mesh and primitive, POSITION + TEXCOORD_0 + u32 indices, one material whose
 * only map is an embedded baseColorTexture. OpenMVS's own GLB is the input to
 * this re-pack, never the shipped file.
 *
 * `WebIO`, not `NodeIO`: NodeIO's constructor imports `node:fs`, and the probe
 * scene packs in the browser. Neither touches the filesystem here.
 */
import { Document, Primitive, TextureInfo, WebIO } from '@gltf-transform/core';

export type TexturedMeshGeometry = {
  readonly positions: Float32Array; // 3 per vertex, group-frame metres
  readonly uvs: Float32Array; // 2 per vertex
  readonly indices: Uint32Array; // 3 per triangle
  readonly image: { readonly bytes: Uint8Array; readonly mimeType: 'image/jpeg' | 'image/png' };
};

/** The frame is the one thing a viewer cannot infer from the file itself (spec §5). */
const FRAME_NOTE = 'group ENU metres, +Z up';

export async function packMeshGlb(geometry: TexturedMeshGeometry): Promise<Uint8Array> {
  const doc = new Document();
  doc.getRoot().getAsset().extras = { frame: FRAME_NOTE };

  const buffer = doc.createBuffer();
  // The casts: gltf-transform's TypedArray pins the backing buffer to
  // `ArrayBuffer`; the shapes above take TS's default `ArrayBufferLike`.
  const positions = doc
    .createAccessor('positions')
    .setType('VEC3')
    .setArray(geometry.positions as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);
  const uvs = doc
    .createAccessor('uvs')
    .setType('VEC2')
    .setArray(geometry.uvs as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);
  const indices = doc
    .createAccessor('indices')
    .setType('SCALAR')
    .setArray(geometry.indices as Uint32Array<ArrayBuffer>)
    .setBuffer(buffer);

  const texture = doc
    .createTexture('baseColor')
    .setImage(geometry.image.bytes)
    .setMimeType(geometry.image.mimeType);
  const material = doc.createMaterial('meshTexture').setBaseColorTexture(texture);
  material
    .getBaseColorTextureInfo()!
    .setMinFilter(TextureInfo.MinFilter.LINEAR!)
    .setMagFilter(TextureInfo.MagFilter.LINEAR!);

  const primitive = doc
    .createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES!)
    .setAttribute('POSITION', positions)
    .setAttribute('TEXCOORD_0', uvs)
    .setIndices(indices)
    .setMaterial(material);
  const mesh = doc.createMesh('mesh').addPrimitive(primitive);
  doc.createScene('scene').addChild(doc.createNode('mesh').setMesh(mesh));

  return new WebIO().writeBinary(doc);
}
