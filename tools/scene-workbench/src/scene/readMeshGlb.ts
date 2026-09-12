/**
 * Reads the `mesh.glb` subset (spec §5) in the browser. `WebIO` fetches
 * nothing for a self-contained GLB; `meshGlbGeometry` does the refusing.
 */
import { WebIO } from '@gltf-transform/core';
import { meshGlbGeometry } from '../../../scene-recon/pack/meshGlbGeometry';
import type { TexturedMeshGeometry } from '../../../scene-recon/pack/packMeshGlb';

export async function readMeshGlb(buffer: ArrayBuffer): Promise<TexturedMeshGeometry> {
  return meshGlbGeometry(await new WebIO().readBinary(new Uint8Array(buffer)));
}
