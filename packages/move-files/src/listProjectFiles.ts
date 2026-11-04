/**
 * listProjectFiles: every file git would consider part of the project (tracked
 * plus untracked, minus ignored), as absolute paths.
 *
 * Git is the file lister because it works in any repo and honours `.gitignore`
 * without walking `node_modules`. `-z` keeps paths with spaces or newlines whole.
 * Tracked files deleted from disk are still listed; `readSnapshot` skips them.
 */

import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

export function listProjectFiles(root: string): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error(`${root} is not inside a git repository; move-files lists files through git.`);
  }
  return out
    .split('\0')
    .filter((rel) => rel !== '')
    .map((rel) => posix.join(root, rel));
}
