import { statSync } from 'node:fs';
import type { R2SyncGroup } from './R2SyncGroup';
import type { R2Upload } from './R2Upload';
import { fileMd5 } from '../../utils/io/fileMd5';
import { etagMatches } from './etagMatches';
import { remoteEtag } from './remoteEtag';
import { uploadViaWrangler } from './uploadViaWrangler';

export type R2SyncContext = {
  readonly bucket: string;
  readonly publicUrl: string;
  readonly cacheControl: string;
};

/**
 * Upload one group, skipping files R2 already holds byte-identical.
 *
 * Skipping earns its keep beyond bandwidth: it stops a flaky multi-hundred-MB
 * re-upload from aborting the run before the CDN purge, and keeps a few-KB
 * sidecar edit from dragging the whole ~370 MB artefact set across the wire.
 * A skipped file stays out of `touchedKeys` — the edge already matches origin.
 */
export async function syncGroup(
  group: R2SyncGroup,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<void> {
  if (group.files.length === 0) return;
  console.log(`\n--- ${group.label} (${group.files.length}) ---\n`);
  for (const file of group.files) {
    await uploadIfChanged(file, ctx, touchedKeys);
  }
}

async function uploadIfChanged(
  file: R2Upload,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<void> {
  const remote = await remoteEtag(`${ctx.publicUrl}/${file.r2Key}`);
  if (remote && etagMatches(fileMd5(file.localPath), remote)) {
    const sizeMB = (statSync(file.localPath).size / 1024 / 1024).toFixed(1);
    console.log(`= ${file.localPath} (${sizeMB} MB) unchanged — skip`);
    return;
  }
  uploadViaWrangler(file, ctx.bucket, ctx.cacheControl);
  touchedKeys.push(file.r2Key);
}
