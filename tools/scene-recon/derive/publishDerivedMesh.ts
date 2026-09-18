/**
 * Writes a derived mesh's `mesh.glb` and publishes it to the group manifest
 * as `<source.id>-<idSuffix>` — the write half every derived-mesh CLI shares;
 * `cropMesh` and `repackAtlas` differ only in `derived`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assetArtifactUrl, groupAssetDir } from '../manifest/geo3dLayout';
import { publishAsset } from '../manifest/publishAsset';
import { packMeshGlb } from '../pack/packMeshGlb';
import type { SceneGroupDefinition } from '../@types/SceneGroupDefinition';
import type { TexturedMeshGeometry } from '../pack/packMeshGlb';
import type { PipelineStep } from '../../scene-workbench/@types/PipelineStep';
import type { TexturedMeshAsset } from '../../scene-workbench/@types/TexturedMeshAsset';

export async function publishDerivedMesh(
  group: SceneGroupDefinition,
  source: TexturedMeshAsset,
  derived: {
    idSuffix: string; // 'cropped' | '4k' | '2k' — the id becomes `${source.id}-${idSuffix}`
    labelSuffix: string; // the label becomes `${source.label} — ${labelSuffix}`
    step: PipelineStep;
    geometry: TexturedMeshGeometry;
  },
): Promise<TexturedMeshAsset> {
  const id = `${source.id}-${derived.idSuffix}`;
  const outDir = groupAssetDir(group.id, id);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'mesh.glb'), await packMeshGlb(derived.geometry));

  const asset: TexturedMeshAsset = {
    kind: 'mesh',
    id,
    label: `${source.label} — ${derived.labelSuffix}`,
    transform: source.transform,
    provenance: {
      ...source.provenance,
      pipeline: [...source.provenance.pipeline, derived.step],
    },
    triangleCount: derived.geometry.indices.length / 3,
    artifactUrl: assetArtifactUrl(group.id, id, 'mesh.glb'),
  };
  await publishAsset(group, asset);

  return asset;
}
