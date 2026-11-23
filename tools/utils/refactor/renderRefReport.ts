/**
 * renderRefReport: a `RefReport` as `--json` or a terminal table.
 *
 * The JSON shape is a contract the mutating subcommands' previews parse, so it
 * mirrors the report field for field plus a `summary` of the three counts; tests
 * pin its keys and counts, never the whitespace. The text table is for a person,
 * so its columns are free to change and no test pins them.
 */

import type { RefReport } from '../../@types/refactor/RefReport';

export function renderRefReport(report: RefReport<string>, json: boolean): string {
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
  return [header, ...rows].join('\n');
}
