import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { R2SyncGroup } from '../@types/R2SyncGroup';
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
 * rclone sets `Content-Encoding` but never compresses, so a `gzipOnWire` group
 * is copied from a staged tree of gzipped files under the same relative paths.
 *
 * `--checksum` compares size and MD5 against the ETag the bucket listing already carries
 * (MD5 for every single-part upload, which is anything under rclone's 200 MiB cutoff). The
 * default size+mtime check reads each object's mtime metadata with one HEAD per file:
 * minutes for ~40k tiles where nothing changed.
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
    const sourceRoot = group.gzipOnWire
      ? stageGzipped(localRoot, relatives, join(listDir, 'staged'))
      : localRoot;

    console.log(`▶ rclone copy ${group.files.length} file(s) → r2://${bucket}/${keyRoot}`);
    execFileSync(
      'rclone',
      [
        'copy',
        sourceRoot,
        `${RCLONE_REMOTE}:${bucket}/${keyRoot}`,
        '--checksum',
        '--files-from',
        listPath,
        '--header-upload',
        `Cache-Control: ${group.cacheControl}`,
        ...(group.gzipOnWire ? ['--header-upload', 'Content-Encoding: gzip'] : []),
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

function stageGzipped(localRoot: string, relatives: readonly string[], stageRoot: string): string {
  for (const rel of relatives) {
    const source = join(localRoot, rel);
    const staged = join(stageRoot, rel);
    mkdirSync(dirname(staged), { recursive: true });
    writeFileSync(staged, gzipSync(readFileSync(source)));
  }
  return stageRoot;
}
