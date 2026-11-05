/**
 * listProjectFiles: every file git would consider part of the project (tracked
 * plus untracked, minus ignored), as absolute paths.
 *
 * Git is the file lister because it works in any repo and honours `.gitignore`
 * without walking `node_modules`. `-z` keeps paths with spaces or newlines whole.
 * Tracked files deleted from disk are still listed; `readSnapshot` skips them.
 * Below the repo root git lists only that subtree, so importers elsewhere would
 * silently go stale: that is refused.
 */

import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

export function listProjectFiles(root: string): string[] {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  let prefix: string;
  let out: string;
  try {
    prefix = git('rev-parse', '--show-prefix').trim();
    out = git('ls-files', '-z', '--cached', '--others', '--exclude-standard');
  } catch {
    throw new Error(`${root} is not inside a git repository; move-files lists files through git.`);
  }
  if (prefix !== '') throw new Error(`Run move-files from the repository root, not ${prefix}.`);
  return out
    .split('\0')
    .filter((rel) => rel !== '')
    .map((rel) => posix.join(root, rel));
}
