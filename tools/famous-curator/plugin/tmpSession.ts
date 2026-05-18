/**
 * tmpSession — per-fetch ephemeral directory allocator.
 *
 * Every /api/fetch creates a session: a fresh 8-char id and an empty
 * directory at $TMPDIR/famous-curator/<id>/.  The id is the opaque
 * "tmpId" the API returns to the client, and all subsequent
 * /api/process / /api/process/alpha-only / /api/export calls use it to
 * locate the cached intermediates.
 *
 * We deliberately don't auto-clean the tmpdir on a timer or on /api/export
 * success — the maintainer might want to re-export after tweaking
 * metadata.  The directory will be reaped by the OS on next reboot
 * (macOS purges $TMPDIR weekly).  If footprint becomes a problem we
 * can add a manual cleanup step in Plan D.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT_NAME = 'famous-curator';

export function sessionPath(tmpId: string): string {
  return resolve(tmpdir(), ROOT_NAME, tmpId);
}

export function sessionFilePath(tmpId: string, filename: string): string {
  return resolve(sessionPath(tmpId), filename);
}

export function createSession(): { tmpId: string; dir: string } {
  // 8 hex chars = 32 bits.  Collisions are astronomically unlikely
  // for a local-only tool with at most a few concurrent sessions.
  const tmpId = randomBytes(4).toString('hex');
  const dir = sessionPath(tmpId);
  mkdirSync(dir, { recursive: true });
  return { tmpId, dir };
}
