import { statSync } from 'node:fs';
import type { R2SyncGroup } from './R2SyncGroup';
import type { R2Upload } from './R2Upload';
import { etagMatches } from './etagMatches';
import { localUploadHash } from './localUploadHash';
import { remoteEtag } from './remoteEtag';
import { uploadViaRclone } from './uploadViaRclone';
import { uploadViaWrangler } from './uploadViaWrangler';
import type { RcloneCredentials } from './rcloneEnv';

export type R2SyncContext = {
  readonly bucket: string;
  readonly publicUrl: string;
  /** Absent when no bulk group has files — see the preflight in syncR2.ts. */
  readonly rcloneCredentials: RcloneCredentials | null;
};

/**
 * `delegated` counts files handed to a bulk transport, which does its own
 * diffing and reports its own transfer stats — we genuinely don't know how
 * many of them moved, and guessing would make the summary lie in one
 * direction or the other.
 */
export type R2SyncResult = {
  readonly uploaded: number;
  readonly delegated: number;
};

/** Upload one group, skipping files R2 already holds byte-identical. */
export async function syncGroup(
  group: R2SyncGroup,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<R2SyncResult> {
  if (group.files.length === 0) return { uploaded: 0, delegated: 0 };
  console.log(`\n--- ${group.label} (${group.files.length}) ---\n`);

  if (group.transport.kind === 'bulk') {
    if (ctx.rcloneCredentials === null) {
      throw new Error(`${group.label}: bulk transport reached without credentials`);
    }
    uploadViaRclone({ ...group, transport: group.transport }, ctx.bucket, ctx.rcloneCredentials);
    if (group.purge) touchedKeys.push(...group.files.map((f) => f.r2Key));
    return { uploaded: 0, delegated: group.files.length };
  }

  let uploaded = 0;
  for (const file of group.files) {
    if (await uploadIfChanged(file, group, ctx, touchedKeys)) uploaded++;
  }
  return { uploaded, delegated: 0 };
}

/**
 * True when the file was uploaded, false when R2 already had those bytes.
 *
 * Skipping earns its keep beyond bandwidth: it stops a flaky multi-hundred-MB
 * re-upload from aborting the run before the CDN purge, and keeps a few-KB
 * sidecar edit from dragging the whole ~370 MB artefact set across the wire.
 */
async function uploadIfChanged(
  file: R2Upload,
  group: R2SyncGroup,
  ctx: R2SyncContext,
  touchedKeys: string[],
): Promise<boolean> {
  const remote = await remoteEtag(`${ctx.publicUrl}/${file.r2Key}`);
  if (remote && etagMatches(localUploadHash(file), remote)) {
    const sizeMB = (statSync(file.localPath).size / 1024 / 1024).toFixed(1);
    console.log(`= ${file.localPath} (${sizeMB} MB) unchanged — skip`);
    return false;
  }
  uploadViaWrangler(file, ctx.bucket, group.cacheControl);
  if (group.purge) touchedKeys.push(file.r2Key);
  return true;
}
