/**
 * renderRefReport — turn a `RefReport` into the text the `refs` subcommand prints,
 * in one of two shapes: a machine-readable `--json` document or a scannable
 * human table.
 *
 * ## Why the JSON shape is a straight serialization
 *
 * The `--json` form is a stable contract other tools (and the mutating
 * subcommands' `--dry` previews) parse, so it mirrors `RefReport` field-for-field
 * with one added `summary` block that pre-computes the three counts a caller most
 * often wants (total refs, distinct files, tests). Keeping it a plain
 * `JSON.stringify` of a flat object — no cleverness, no omitted fields — is why
 * the test asserts the SHAPE (keys + counts) rather than a golden string: the
 * structure is the contract, the whitespace is not.
 *
 * ## Why the human form is not pinned by a test
 *
 * The non-JSON rendering exists for a person reading a terminal; its exact
 * columns and wording are free to change. Pinning it with a snapshot would make
 * every cosmetic tweak a test edit for no correctness gain, so only the JSON
 * branch carries a structural test and the text branch is left un-pinned.
 */

import type { RefReport } from './collectRefs';

export function renderRefReport(report: RefReport, json: boolean): string {
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
      `  ${entry.filePath}:${entry.line}:${entry.column}  ${entry.kind}  ${entry.enclosing}`,
  );
  return [header, ...rows].join('\n');
}
