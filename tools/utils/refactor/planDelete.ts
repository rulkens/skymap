/**
 * planDelete: remove one exported symbol, and its file and test mirror when it was the
 * file's only reason to exist, but only after proving nothing points at it.
 *
 * Any reference of any kind refuses, tests and re-exports included: a delete has no safe
 * partial form, and a barrel-repair branch would exist for a case this repo forbids.
 * The declaration's own tokens (overload names, a recursive call, its own `export { x }`)
 * do not count; the export specifier is cut with it. The file goes only if no non-import
 * statement survives the cut; a stray helper or side-effect statement is never deleted.
 */

import ts from 'typescript';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { companionPaths } from './companionPaths';
import { declarationSpan } from './declarationSpan';
import { isLocalExportSpecifier } from './isLocalExportSpecifier';
import { renderRefReport } from './renderRefReport';

export function planDelete(input: {
  found: FoundRefs;
  root: string;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult {
  const { found, read } = input;
  const { at } = found;
  const text = read(at.file);
  const span = declarationSpan(text, at);
  const own = (ref: { file: string; start: number; end: number }): boolean =>
    ref.file === at.file && ref.start >= span.start && ref.end <= span.end;
  const specifiers = found.refs.filter(
    (ref) => ref.file === at.file && !own(ref) && isLocalExportSpecifier(text, ref),
  );

  const blocking = found.report.refs.filter((_, i) => {
    const ref = found.refs[i]!;
    return !own(ref) && !specifiers.includes(ref);
  });
  if (blocking.length > 0) {
    const { report } = found;
    const files = new Set(blocking.map((e) => e.filePath));
    const header =
      `Cannot delete '${report.target}': ${blocking.length} reference(s) still point to it. ` +
      'Remove them first, then re-run:';
    const rest = {
      ...report,
      refs: blocking,
      fileCount: files.size,
      testCount: blocking.filter((e) => e.inTest).length,
    };
    return { ok: false, refusals: [`${header}\n${renderRefReport(rest, false)}`] };
  }

  const spans = [span, ...specifiers.map((ref) => declarationSpan(text, ref))].sort(
    (a, b) => b.start - a.start,
  );
  let rest = text;
  for (const { start, end } of spans) rest = rest.slice(0, start) + rest.slice(end);
  const hasMore = ts
    .createSourceFile(at.file, rest, ts.ScriptTarget.Latest)
    .statements.some((statement) => !ts.isImportDeclaration(statement));
  const plan = { edits: [] as TextEdit[], moves: [], deletes: [] as string[], findings: [] };
  if (hasMore) {
    return {
      ok: true,
      plan: {
        ...plan,
        edits: spans.map(({ start, end }) => ({ file: at.file, start, end, text: '' })),
      },
    };
  }
  const files = companionPaths({
    root: input.root,
    from: at.file,
    to: at.file,
    exists: input.exists,
  });
  return { ok: true, plan: { ...plan, deletes: files.map((m) => m.from) } };
}
