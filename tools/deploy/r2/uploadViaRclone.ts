import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { R2SyncGroup } from './R2SyncGroup';
import { RCLONE_REMOTE, rcloneEnv, type RcloneCredentials } from './rcloneEnv';

/** Parallel transfers. R2 has no documented per-connection cap; 32 saturates a home uplink. */
const TRANSFERS = 32;

/**
 * Upload a whole group in one `rclone copy`.
 *
 * rclone addresses a tree plus a relative file list rather than key pairs, so
 * the group's `localRoot`/`keyRoot` must be the prefixes its files hang off —
 * `relative()` here would silently emit `../` escapes otherwise, and rclone
 * would refuse them.
 *
 * `copy` never deletes, so a stale remote object outlives a shrinking local
 * tree. That is the right default for immutable content and the reason a
 * re-bake should write a new key prefix rather than overwrite this one.
 */
export function uploadViaRclone(
  group: R2SyncGroup & { transport: { kind: 'bulk'; localRoot: string; keyRoot: string } },
  bucket: string,
  creds: RcloneCredentials,
): void {
  const { localRoot, keyRoot } = group.transport;
  const listDir = mkdtempSync(join(tmpdir(), 'skymap-rclone-'));
  const listPath = join(listDir, 'files-from.txt');
  try {
    const relatives = group.files.map((f) => relative(localRoot, f.localPath));
    writeFileSync(listPath, `${relatives.join('\n')}\n`);

    console.log(`▶ rclone copy ${group.files.length} file(s) → r2://${bucket}/${keyRoot}`);
    execFileSync(
      'rclone',
      [
        'copy',
        localRoot,
        `${RCLONE_REMOTE}:${bucket}/${keyRoot}`,
        '--files-from',
        listPath,
        '--header-upload',
        `Cache-Control: ${group.cacheControl}`,
        '--transfers',
        String(TRANSFERS),
        '--checkers',
        String(TRANSFERS),
        '--progress',
      ],
      { stdio: 'inherit', env: { ...process.env, ...rcloneEnv(creds) } },
    );
  } finally {
    rmSync(listDir, { recursive: true, force: true });
  }
}
