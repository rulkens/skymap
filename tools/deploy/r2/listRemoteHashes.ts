import { execFileSync } from 'node:child_process';
import type { RemoteHashes } from '../@types/RemoteHashes';
import { RCLONE_REMOTE, rcloneEnv, type RcloneCredentials } from './rcloneEnv';
import { remoteHashesFromLsjson } from './remoteHashesFromLsjson';

const CHECKERS = 32;

/**
 * One read-only listing of `keys` on R2. `--files-from` makes rclone list only
 * the directories those keys sit in (one request per directory, in parallel),
 * never the old tile trees beside them; the MD5 comes from the listing's ETag.
 */
export function listRemoteHashes(
  keys: readonly string[],
  bucket: string,
  creds: RcloneCredentials,
): RemoteHashes {
  if (keys.length === 0) return new Map();
  console.error(`▶ rclone lsjson ${keys.length} key(s) on r2://${bucket}`);
  const json = execFileSync(
    'rclone',
    [
      'lsjson',
      `${RCLONE_REMOTE}:${bucket}`,
      '--recursive',
      '--files-only',
      '--hash',
      '--hash-type',
      'MD5',
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
  return remoteHashesFromLsjson(json);
}
