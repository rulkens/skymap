/**
 * applyPlan: put a plan on disk so that a failure loses nothing and says where things are.
 *
 * Stage writes each rewritten moved file beside its destination, under a temp name; if
 * that fails the temps go and the project is as it was. Commit then vacates every
 * source and renames the temps home, so chains, swaps and case-only renames (where
 * on macOS destination and source are one file) need no ordering. A moved file with
 * unchanged text is only renamed, which keeps its mode, bytes and symlink. Edits to
 * files that stay are written in place last. Emptied directories are left behind.
 */

import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { posix } from 'node:path';
import type { ApplyResult } from './@types/ApplyResult';
import type { MoveFs } from './@types/MoveFs';
import type { MovePlan } from './@types/MovePlan';

const diskFs: MoveFs = {
  readFile: (path) => readFileSync(path),
  writeFile: (path, data) => writeFileSync(path, data),
  mkdirp: (dir) => void mkdirSync(dir, { recursive: true }),
  remove: (path) => rmSync(path, { force: true }),
  rename: (from, to) => renameSync(from, to),
  copyMode: (from, to) => chmodSync(to, statSync(from).mode),
};

const stagedName = (destination: string) => `${destination}.move-files-tmp`;

export function applyPlan(plan: MovePlan, root: string, fs: MoveFs = diskFs): ApplyResult {
  const moves = new Map(
    plan.moves.map((m) => [posix.resolve(root, m.from), posix.resolve(root, m.to)]),
  );
  const texts = new Map(plan.edits.map((e) => [e.from, e.text]));
  const staged = new Map<string, string>(); // moved source -> its rewritten temp
  const completed: string[] = [];
  let current = '';

  try {
    for (const [from, to] of moves) {
      current = to;
      fs.mkdirp(posix.dirname(to));
      const text = texts.get(from);
      if (text === undefined || fs.readFile(from).equals(Buffer.from(text))) continue;
      staged.set(from, stagedName(to));
      fs.writeFile(stagedName(to), text);
      fs.copyMode(from, stagedName(to));
    }
  } catch {
    for (const temp of staged.values()) fs.remove(temp);
    return { failed: current, completed };
  }

  try {
    for (const [from, to] of moves) {
      current = from;
      if (staged.has(from)) fs.remove(from);
      else fs.rename(from, stagedName(to));
    }
    for (const to of moves.values()) {
      current = to;
      fs.rename(stagedName(to), to);
      completed.push(to);
    }
    for (const { from, to, text } of plan.edits) {
      if (from !== to) continue;
      current = to;
      fs.writeFile(to, text);
      completed.push(to);
    }
  } catch {
    return { failed: current, completed };
  }
  return { failed: null, completed };
}
