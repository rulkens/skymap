/**
 * Reads the `mesh.glb` subset (spec §5) — in the browser for the viewer, and
 * in Node for the bake, which re-packs OpenMVS's export through here. `WebIO`
 * fetches nothing for a self-contained GLB, so one reader serves both.
 *
 * Anything richer than the subset is refused rather than half-drawn: a
 * `--max-texture-size` overflow silently splits OpenMVS's atlas across several
 * primitives and textures, and only the first would ever reach the screen.
 */
import { WebIO } from '@gltf-transform/core';
import type { TexturedMeshGeometry } from '../../../scene-recon/pack/packMeshGlb';

export async function readMeshGlb(buffer: ArrayBuffer): Promise<TexturedMeshGeometry> {
  const root = (await new WebIO().readBinary(new Uint8Array(buffer))).getRoot();

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
      `readMeshGlb: expected exactly one primitive, found ${drawn.length} — re-bake with a ` +
        `--max-texture-size the atlas fits in, so TextureMesh emits a single material`,
    );
  }
  const { node, primitive } = drawn[0]!;

  const textures = root.listTextures();
  if (textures.length !== 1) {
    throw new Error(
      `readMeshGlb: expected exactly one texture, found ${textures.length} — re-bake with a ` +
        `--max-texture-size the atlas fits in`,
    );
  }
  const image = textures[0]!.getImage();
  const mimeType = textures[0]!.getMimeType();
  if (!image)
    throw new Error('readMeshGlb: the texture has no embedded image — GLB not self-contained');
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
    throw new Error(`readMeshGlb: unsupported texture mime type "${mimeType}"`);
  }

  const positionData = primitive.getAttribute('POSITION')?.getArray();
  const uvData = primitive.getAttribute('TEXCOORD_0')?.getArray();
  const indexData = primitive.getIndices()?.getArray();
  if (!positionData) throw new Error('readMeshGlb: the primitive has no POSITION attribute');
  if (!uvData)
    throw new Error(
      'readMeshGlb: the primitive has no TEXCOORD_0 attribute — the mesh is untextured',
    );
  if (!indexData) throw new Error('readMeshGlb: the primitive has no indices');

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
