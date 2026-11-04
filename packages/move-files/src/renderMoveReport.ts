/**
 * renderMoveReport: the preview shown before (and after) a batch is applied:
 * the moves, the files whose references were rewritten, then any guard findings.
 * Edits include every moved file, so that section is the full blast radius.
 */

import type { MovePlan } from './@types/MovePlan';

export function renderMoveReport(plan: MovePlan): string {
  const lines = [`move-files: ${plan.moves.length} move(s):`];
  for (const { from, to } of plan.moves) lines.push(`  ${from}  ->  ${to}`);
  lines.push('', `move-files: ${plan.edits.length} file(s) with updated imports:`);
  for (const edit of plan.edits) lines.push(`  ${edit.to}`);
  if (plan.findings.length > 0) {
    lines.push('', `move-files: ${plan.findings.length} finding(s) to fix by hand:`);
    for (const f of plan.findings) lines.push(`  ${f.file}:${f.line}  ${f.reason}  ${f.text}`);
  }
  return `${lines.join('\n')}\n`;
}
