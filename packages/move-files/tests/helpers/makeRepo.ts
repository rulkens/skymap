import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A throwaway git repo holding `files` (relative path -> text); returns its real path. */
export function makeRepo(files: Record<string, string>, init = true): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'move-files-')));
  if (init) execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
