#!/usr/bin/env node
/**
 * crop-mesh — cuts one mesh asset (`--group <id> --asset <assetId>`) to its
 * committed outline and publishes the result as the sibling `<assetId>-cropped`
 * (spec §4.6). The atlas is carried over byte for byte: no re-encode, so the
 * printed coverage is what part 2 budgets a re-pack from.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';

import { cropMeshGeometry } from './crop/cropMeshGeometry';
import { normalizeRing } from './crop/normalizeRing';
import { triangulateOutline } from './crop/triangulateOutline';
import { uvCoverage } from './crop/uvCoverage';
import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import {
  assetArtifactUrl,
  groupAssetDir,
  groupManifestPath,
  meshOutlinePath,
} from './manifest/geo3dLayout';
import { publishAsset } from './manifest/publishAsset';
import { meshGlbGeometry } from './pack/meshGlbGeometry';
import { packMeshGlb } from './pack/packMeshGlb';
import { argValue } from '../utils/cli/argValue';
import type { CropMeshReport } from './@types/CropMeshReport';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';
import type { MeshOutline } from '../scene-workbench/@types/MeshOutline';
import type { SceneManifest } from '../scene-workbench/@types/SceneManifest';
import type { TexturedMeshAsset } from '../scene-workbench/@types/TexturedMeshAsset';

/** Hex digits of the outline's sha256 stamped as the step version. */
const OUTLINE_HASH_HEX = 12;

export async function cropMesh(
  group: SceneGroupDefinition,
  assetId: string,
): Promise<CropMeshReport> {
  const outlinePath = meshOutlinePath(group.id, assetId);
  const outlineBytes = await readFile(outlinePath).catch(() => {
    throw new Error(`cropMesh: no outline at ${outlinePath} — draw one in the scene workbench`);
  });
  const outline = JSON.parse(outlineBytes.toString('utf8')) as MeshOutline;
  if (outline.formatVersion !== 1 || !Array.isArray(outline.ringM)) {
    throw new Error(`cropMesh: ${outlinePath} is not a formatVersion 1 outline`);
  }
  const ringM = normalizeRing(outline.ringM);

  const manifest = JSON.parse(await readFile(groupManifestPath(group.id), 'utf8')) as SceneManifest;
  const source = manifest.assets.find((asset) => asset.id === assetId);
  if (source?.kind !== 'mesh') {
    throw new Error(`cropMesh: group ${group.id} has no mesh asset "${assetId}"`);
  }

  const geometry = meshGlbGeometry(
    await new NodeIO().read(join(groupAssetDir(group.id, assetId), 'mesh.glb')),
  );
  const cropped = cropMeshGeometry(geometry, ringM, triangulateOutline(ringM));

  const croppedId = `${assetId}-cropped`;
  const outDir = groupAssetDir(group.id, croppedId);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'mesh.glb'), await packMeshGlb(cropped));

  const asset: TexturedMeshAsset = {
    kind: 'mesh',
    id: croppedId,
    label: `${source.label} — cropped`,
    transform: source.transform,
    provenance: {
      ...source.provenance,
      pipeline: [
        ...source.provenance.pipeline,
        {
          step: 'cropMesh',
          version: createHash('sha256')
            .update(outlineBytes)
            .digest('hex')
            .slice(0, OUTLINE_HASH_HEX),
        },
      ],
    },
    triangleCount: cropped.indices.length / 3,
    artifactUrl: assetArtifactUrl(group.id, croppedId, 'mesh.glb'),
  };
  await publishAsset(group, asset);

  return {
    asset,
    sourceTriangles: geometry.indices.length / 3,
    uvCoverage: uvCoverage(cropped.uvs, cropped.indices),
  };
}

async function main(): Promise<void> {
  const group = sceneGroupFromArgv(process.argv);
  const assetId = argValue(process.argv, '--asset');
  if (!assetId) throw new Error('cropMesh: --asset <assetId> is required');

  const { asset, sourceTriangles, uvCoverage: coverage } = await cropMesh(group, assetId);
  const kept = ((100 * asset.triangleCount) / sourceTriangles).toFixed(1);
  process.stderr.write(
    `cropMesh: ${asset.triangleCount.toLocaleString()} / ${sourceTriangles.toLocaleString()} ` +
      `triangles (${kept}%), atlas coverage ${(100 * coverage).toFixed(1)}% → ${asset.artifactUrl}\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
