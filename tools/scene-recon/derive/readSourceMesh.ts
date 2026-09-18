/**
 * The manifest lookup and GLB decode every derived-mesh CLI starts from: find
 * the source asset by id, then read its `mesh.glb` into working geometry.
 * Lifted out of `cropMesh` so `repackAtlas` (part 2) shares it verbatim.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NodeIO } from '@gltf-transform/core';

import { groupAssetDir, groupManifestPath } from '../manifest/geo3dLayout';
import { meshGlbGeometry } from '../pack/meshGlbGeometry';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { TexturedMeshGeometry } from '../pack/packMeshGlb';
import type { SceneManifest } from '../../scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../../scene-workbench/@types/TexturedMeshAsset';

export async function readSourceMesh(
  group: SceneGroupDefinition,
  assetId: string,
): Promise<{ source: TexturedMeshAsset; geometry: TexturedMeshGeometry }> {
  const manifest = JSON.parse(await readFile(groupManifestPath(group.id), 'utf8')) as SceneManifest;
  const source = manifest.assets.find((asset) => asset.id === assetId);
  if (source?.kind !== 'mesh') {
    throw new Error(`readSourceMesh: group ${group.id} has no mesh asset "${assetId}"`);
  }

  const geometry = meshGlbGeometry(
    await new NodeIO().read(join(groupAssetDir(group.id, assetId), 'mesh.glb')),
  );

  return { source, geometry };
}
