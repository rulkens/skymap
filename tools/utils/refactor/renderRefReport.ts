/**
 * renderRefReport: a `RefReport` as `--json` or a terminal table.
 *
 * The JSON shape is a contract the mutating subcommands' previews parse, so it
 * mirrors the report field for field plus a `summary` of the three counts; tests
 * pin its keys and counts, never the whitespace. The text table is for a person,
 * so its columns are free to change and no test pins them.
 */

import type { Finding } from '../../@types/refactor/Finding';
import type { RefReport } from '../../@types/refactor/RefReport';

// A property report also lists the quoted mentions of `prop` the engine cannot track.
export function renderRefReport(
  report: RefReport<string>,
  json: boolean,
  untracked?: { prop: string; findings: readonly Finding[] },
): string {
  if (json) {
    return JSON.stringify(
      {
        target: report.target,
        summary: {
          refs: report.refs.length,
          files: report.fileCount,
          tests: report.testCount,
        },
        refs: report.refs.map((entry) => ({
          filePath: entry.filePath,
          line: entry.line,
          column: entry.column,
          kind: entry.kind,
          inTest: entry.inTest,
          enclosing: entry.enclosing,
        })),
        ...(untracked && { unreported: untracked.findings }),
      },
      null,
      2,
    );
  }

  const header = `${report.target} — ${report.refs.length} refs across ${report.fileCount} files (${report.testCount} in tests/)`;
  const rows = report.refs.map(
    (entry) =>
      `  ${entry.filePath}:${entry.line}:${entry.column}  ${entry.kind}${entry.inTest ? ' (test)' : ''}  ${entry.enclosing}`,
  );
  const footer = untracked?.findings.length
    ? [
        `${untracked.findings.length} quoted mention(s) of '${untracked.prop}' are not tracked: ` +
          untracked.findings.map((f) => `${f.file}:${f.line}`).join(', '),
      ]
    : [];
  return [header, ...rows, ...footer].join('\n');
}
