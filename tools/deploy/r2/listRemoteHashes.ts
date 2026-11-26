import { execFileSync } from 'node:child_process';
import type { RemoteHashes } from '../@types/RemoteHashes';
import { RCLONE_REMOTE, rcloneEnv, type RcloneCredentials } from './rcloneEnv';
import { remoteHashesFromMd5sum } from './remoteHashesFromMd5sum';

const CHECKERS = 32;

/**
 * One read-only check of `keys` on R2. `md5sum` hashes in parallel
 * (`--checkers`); `lsjson --hash` does the same work one object at a time, minutes
 * for a few hundred keys. Absent keys are skipped silently, so they stay absent.
 */
export function listRemoteHashes(
  keys: readonly string[],
  bucket: string,
  creds: RcloneCredentials,
): RemoteHashes {
  if (keys.length === 0) return new Map();
  console.error(`▶ rclone md5sum ${keys.length} key(s) on r2://${bucket}`);
  const out = execFileSync(
    'rclone',
    [
      'md5sum',
      `${RCLONE_REMOTE}:${bucket}`,
      '--files-from',
      '-',
      '--checkers',
      String(CHECKERS),
      '-q',
    ],
    {
      input: `${keys.join('\n')}\n`,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...rcloneEnv(creds) },
    },
  );
  return remoteHashesFromMd5sum(out);
}
