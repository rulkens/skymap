/** Reason per draft path (as `a.b.c`) of the effects a failed compile names, each trimmed to the draft. */
import { trimToDraftPath } from './trimToDraftPath';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { ClipCompileReason } from '../../../../../src/@types/animation/ClipCompileReason';
import type { TimelineCompile } from '../../@types/rows/TimelineCompile';

export function culpritReasons(
  draft: ClipData,
  compile: TimelineCompile | null,
): Map<string, ClipCompileReason[]> {
  const found = new Map<string, ClipCompileReason[]>();
  if (compile === null || compile.ok) return found;
  for (const path of compile.error.paths) {
    const trimmed = trimToDraftPath(draft, path);
    if (trimmed === null) continue;
    const key = trimmed.join('.');
    const reasons = found.get(key) ?? [];
    if (!reasons.includes(compile.error.reason)) reasons.push(compile.error.reason);
    found.set(key, reasons);
  }
  return found;
}
