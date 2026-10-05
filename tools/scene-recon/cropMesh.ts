#!/usr/bin/env node
/**
 * crop-mesh — cuts one mesh asset (`--group <id> --asset <assetId>`) to its
 * committed outline and publishes the result as the sibling `<assetId>-cropped`
 * (spec §4.6). The atlas is carried over byte for byte: no re-encode, so the
 * printed coverage is what part 2 budgets a re-pack from.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { cropMeshGeometry } from './crop/cropMeshGeometry';
import { normalizeRing } from './crop/normalizeRing';
import { triangulateOutline } from './crop/triangulateOutline';
import { uvCoverage } from './crop/uvCoverage';
import { publishDerivedMesh } from './derive/publishDerivedMesh';
import { readSourceMesh } from './derive/readSourceMesh';
import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import { meshOutlinePath } from './manifest/geo3dLayout';
import { argValue } from '../utils/cli/argValue';
import type { CropMeshReport } from './@types/CropMeshReport';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';
import type { MeshOutline } from '../scene-workbench/@types/MeshOutline';

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

  const { source, geometry } = await readSourceMesh(group, assetId);
  const cropped = cropMeshGeometry(geometry, ringM, triangulateOutline(ringM));

  const asset = await publishDerivedMesh(group, source, {
    idSuffix: 'cropped',
    labelSuffix: 'cropped',
    step: {
      step: 'cropMesh',
      version: createHash('sha256').update(outlineBytes).digest('hex').slice(0, OUTLINE_HASH_HEX),
    },
    geometry: cropped,
  });

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
