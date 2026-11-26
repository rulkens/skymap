/**
 * writePlan: put the run's overlay on disk once, through move-files' `applyPlan`, so a
 * failure leaves nothing half-moved; files the run deleted are removed last.
 * A path that was moved away is not deleted a second time, and one that holds text is
 * being rewritten, not removed.
 */

import { rmSync } from 'node:fs';
import { applyPlan } from '../../../packages/move-files/src/applyPlan';
import type { ApplyResult } from '../../../packages/move-files/src/@types/ApplyResult';
import type { FileEdit } from '../../../packages/move-files/src/@types/FileEdit';
import type { Overlay } from '../../@types/refactor/Overlay';

export function writePlan(overlay: Overlay, root: string): ApplyResult {
  const finalPath = new Map(overlay.moves.map((m) => [m.to, m.from]));
  const edits: FileEdit[] = [...overlay.texts].map(([path, text]) => ({
    from: finalPath.get(path) ?? path,
    to: path,
    text,
  }));
  const result = applyPlan({ moves: overlay.moves, edits, findings: [] }, root);
  if (result.failed !== null) return result;

  const moved = new Set(overlay.moves.map((m) => m.from));
  for (const path of overlay.deletes) {
    if (!moved.has(path) && !overlay.texts.has(path)) rmSync(path, { force: true });
  }
  return result;
}
