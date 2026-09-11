/**
 * Where a bake's outputs live under `public/data/`, and the urls the manifest
 * points at — shared so the two bake CLIs can never disagree about a path.
 * Paths are relative to the repo root (a bake runs from cwd); urls are
 * relative to the data root the viewer's `dataUrl()` resolves against, which
 * is why the two are built separately rather than one derived from the other.
 */
import { join } from 'node:path';

export const GEO3D_DIR = 'public/data/geo3d';

export function groupAssetDir(groupId: string, assetId: string): string {
  return join(GEO3D_DIR, 'groups', groupId, 'assets', assetId);
}

export function groupManifestPath(groupId: string): string {
  return join(GEO3D_DIR, 'groups', groupId, 'manifest.json');
}

export function registryPath(): string {
  return join(GEO3D_DIR, 'scenes.json');
}

export function assetArtifactUrl(groupId: string, assetId: string, fileName: string): string {
  return `geo3d/groups/${groupId}/assets/${assetId}/${fileName}`;
}
