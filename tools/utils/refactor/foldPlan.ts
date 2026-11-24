/**
 * foldPlan: apply one plan to the run's overlay without touching the disk, so the next
 * batch entry sees its result. Edits land first, at the paths the engine reported; then
 * a move's importers are rewritten by move-files over every project file, as `applyPlan`
 * would, and the moved text is re-keyed. A move whose source is an earlier move's
 * destination is composed (A to B, B to C is A to C), since only A exists on disk.
 */

import { rewriteReferences } from '../../../packages/move-files/src/rewriteReferences';
import type { DiskView } from '../../@types/refactor/DiskView';
import type { Overlay } from '../../@types/refactor/Overlay';
import type { OverlayChanges } from '../../@types/refactor/OverlayChanges';
import type { Plan } from '../../@types/refactor/Plan';
import { foldEdits } from './foldEdits';

export function foldPlan(plan: Plan, overlay: Overlay, disk: DiskView): OverlayChanges {
  const { texts, deletes } = overlay;
  const changed = new Set<string>();
  const created = new Set<string>();
  const gone = new Set<string>();
  const read = (file: string): string => texts.get(file) ?? disk.read(file);

  for (const [file, text] of foldEdits(plan.edits, read)) {
    texts.set(file, text);
    changed.add(file);
  }

  if (plan.moves.length > 0) {
    const base = disk.snapshot();
    const sources = new Set(plan.moves.map((m) => m.from));
    const exists = (file: string): boolean =>
      texts.has(file) || (!deletes.has(file) && base.fileExists(file));
    for (const { from, to } of plan.moves) {
      if (!sources.has(to) && from.toLowerCase() !== to.toLowerCase() && exists(to)) {
        throw new Error(`Cannot move ${from}: ${to} already exists`);
      }
    }
    const snapshot = {
      texts: new Map([...base.texts].filter(([file]) => !deletes.has(file)).concat([...texts])),
      fileExists: exists,
    };
    const edits = rewriteReferences(snapshot, new Map(plan.moves.map((m) => [m.from, m.to])), []);
    for (const { from, to } of edits) {
      if (from === to) continue;
      texts.delete(from);
      changed.delete(from);
    }
    for (const { from, to, text } of edits) {
      texts.set(to, text);
      if (from === to) changed.add(to);
    }
    for (const { from, to } of plan.moves) {
      const earlier = overlay.moves.find((m) => m.to === from);
      if (earlier) overlay.moves[overlay.moves.indexOf(earlier)] = { from: earlier.from, to };
      else overlay.moves.push({ from, to });
      deletes.add(from);
      gone.add(from);
    }
    for (const { to } of plan.moves) {
      deletes.delete(to);
      gone.delete(to);
      created.add(to);
    }
  }

  for (const file of plan.deletes) {
    texts.delete(file);
    changed.delete(file);
    deletes.add(file);
    gone.add(file);
  }
  return { changed: [...changed], created: [...created], deleted: [...gone] };
}
