/**
 * The `mesh.glb` subset (spec §5) read back out of a parsed glTF document —
 * `packMeshGlb`'s reader half. The viewer reaches it through `readMeshGlb`
 * (WebIO, self-contained GLB); `bakeMesh`'s re-pack hands it a `NodeIO`
 * document, the only IO that resolves OpenMVS's sidecar texture URI.
 *
 * Anything richer than the subset is refused rather than half-drawn: a
 * `--max-texture-size` overflow silently splits OpenMVS's atlas across several
 * primitives and textures, and only the first would ever reach the screen.
 */
import type { Document } from '@gltf-transform/core';
import type { TexturedMeshGeometry } from './packMeshGlb';

export function meshGlbGeometry(document: Document): TexturedMeshGeometry {
  const root = document.getRoot();

  const drawn = root
    .listNodes()
    .filter((node) => node.getMesh())
    .flatMap((node) =>
      node
        .getMesh()!
        .listPrimitives()
        .map((primitive) => ({ node, primitive })),
    );
  if (drawn.length !== 1) {
    throw new Error(
      'meshGlbGeometry: expected exactly one primitive — re-bake with a ' +
        '--max-texture-size the atlas fits in, so TextureMesh emits a single material',
    );
  }
  const { node, primitive } = drawn[0]!;

  const textures = root.listTextures();
  if (textures.length !== 1) {
    throw new Error(
      `meshGlbGeometry: expected exactly one texture, found ${textures.length} — re-bake with a ` +
        `--max-texture-size the atlas fits in`,
    );
  }
  const image = textures[0]!.getImage();
  const mimeType = textures[0]!.getMimeType();
  if (!image)
    throw new Error('meshGlbGeometry: the texture has no embedded image — GLB not self-contained');
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new Error(`meshGlbGeometry: unsupported texture mime type "${mimeType}"`);
  }

  const positionData = primitive.getAttribute('POSITION')?.getArray();
  const uvData = primitive.getAttribute('TEXCOORD_0')?.getArray();
  const indexData = primitive.getIndices()?.getArray();
  if (!positionData) throw new Error('meshGlbGeometry: the primitive has no POSITION attribute');
  if (!uvData)
    throw new Error(
      'meshGlbGeometry: the primitive has no TEXCOORD_0 attribute — the mesh is untextured',
    );
  if (!indexData) throw new Error('meshGlbGeometry: the primitive has no indices');

  const positions = new Float32Array(positionData);
  const m = node.getWorldMatrix(); // column-major; the subset writes identity, OpenMVS may not
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  return {
    positions,
    uvs: new Float32Array(uvData),
    indices: new Uint32Array(indexData),
    image: { bytes: image, mimeType },
  };
}
