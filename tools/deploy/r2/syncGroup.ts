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
};

/**
 * Upload one group, skipping files R2 already holds byte-identical, and report
 * how many actually went up.
 *
 * The count is returned rather than derived from `touchedKeys` because a group
 * with `purge: false` uploads without recording keys — reading the purge list
 * as an upload tally would report those files as unchanged.
 *
 * Skipping earns its keep beyond bandwidth: it stops a flaky multi-hundred-MB
 * re-upload from aborting the run before the CDN purge, and keeps a few-KB
 * sidecar edit from dragging the whole ~370 MB artefact set across the wire.
 */
export async function syncGroup(
  group: R2SyncGroup,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<number> {
  if (group.files.length === 0) return 0;
  console.log(`\n--- ${group.label} (${group.files.length}) ---\n`);
  let uploaded = 0;
  for (const file of group.files) {
    if (await uploadIfChanged(file, group, ctx, touchedKeys)) uploaded++;
  }
  return uploaded;
}

/** True when the file was uploaded, false when R2 already had those bytes. */
async function uploadIfChanged(
  file: R2Upload,
  group: R2SyncGroup,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<boolean> {
  const remote = await remoteEtag(`${ctx.publicUrl}/${file.r2Key}`);
  if (remote && etagMatches(fileMd5(file.localPath), remote)) {
    const sizeMB = (statSync(file.localPath).size / 1024 / 1024).toFixed(1);
    console.log(`= ${file.localPath} (${sizeMB} MB) unchanged — skip`);
    return false;
  }
  uploadViaWrangler(file, ctx.bucket, group.cacheControl);
  if (group.purge) touchedKeys.push(file.r2Key);
  return true;
}
