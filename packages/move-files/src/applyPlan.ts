/**
 * applyPlan: put a plan on disk, writing every destination before deleting any source.
 *
 * Contents are held in memory first, so a swap needs no temp names and a failed
 * write leaves every source intact. The one exception is a case-only rename:
 * on a case-insensitive disk (macOS) the destination IS the source, so writing
 * first and deleting after would delete the file just written. Those sources go
 * first; their text is already in memory. Files without an edit (assets) travel
 * as bytes. Emptied directories are left behind; git does not track them.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import type { MoveFs } from './@types/MoveFs';
import type { MovePlan } from './@types/MovePlan';

const diskFs: MoveFs = {
  readFile: (path) => readFileSync(path),
  writeFile: (path, data) => writeFileSync(path, data),
  mkdirp: (dir) => void mkdirSync(dir, { recursive: true }),
  remove: (path) => rmSync(path, { force: true }),
};

export function applyPlan(
  plan: MovePlan,
  root: string,
  fs: MoveFs = diskFs,
): { readonly failed: string | null } {
  const sources = new Map(
    plan.moves.map((m) => [posix.resolve(root, m.from), posix.resolve(root, m.to)]),
  );
  const edited = new Set(plan.edits.map((e) => e.from));
  const writes = new Map<string, string | Buffer>();
  for (const edit of plan.edits) writes.set(edit.to, edit.text);
  for (const from of sources.keys()) {
    if (!edited.has(from)) writes.set(sources.get(from)!, fs.readFile(from));
  }

  const isCaseOnly = (from: string, to: string) =>
    from !== to && from.toLowerCase() === to.toLowerCase();
  let failed: string | null = null;
  const attempt = (path: string, op: () => void) => {
    if (failed !== null) return;
    try {
      op();
    } catch {
      failed = path;
    }
  };

  for (const [from, to] of sources) if (isCaseOnly(from, to)) attempt(from, () => fs.remove(from));
  for (const [path, data] of writes) {
    attempt(path, () => {
      fs.mkdirp(posix.dirname(path));
      fs.writeFile(path, data);
    });
  }
  for (const [from, to] of sources) {
    if (!writes.has(from) && !isCaseOnly(from, to)) attempt(from, () => fs.remove(from));
  }
  return { failed };
}
