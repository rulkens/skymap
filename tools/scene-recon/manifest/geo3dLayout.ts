/**
 * Where bake outputs live under `public/data/`, committed inputs under `data/`,
 * and the urls the manifest points at — one place so no two callers disagree.
 * Paths are cwd-relative (a bake runs from the repo root); urls are relative to
 * the data root `dataUrl()` resolves against, so neither derives from the other.
 */
import { join } from 'node:path';

export const GEO3D_DIR = 'public/data/geo3d';
export const GEO3D_SOURCE_DIR = 'data/geo3d';

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

export function meshOutlinePath(groupId: string, assetId: string): string {
  return join(GEO3D_SOURCE_DIR, groupId, `${assetId}.outline.json`);
}
