/**
 * planDelete: remove one exported symbol, and its file and test mirror when it was the
 * file's only reason to exist, but only after proving nothing points at it.
 *
 * Any reference of any kind refuses, tests and re-exports included: a delete has no safe
 * partial form, and a barrel-repair branch would exist for a case this repo forbids.
 * The file goes only if no non-import statement survives the cut; a stray helper or
 * side-effect statement is never deleted along with it.
 */

import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { expandCompanions } from '../../../packages/move-files/src/expandCompanions';
import type { Engine } from '../../@types/refactor/Engine';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { collectRefs } from './collectRefs';
import { companionRules } from './companionRules';
import { declarationSpan } from './declarationSpan';
import { renderRefReport } from './renderRefReport';

export function planDelete(input: {
  address: SymbolAddress;
  engine: Engine;
  read: (file: string) => string;
  exists: (file: string) => boolean;
}): PlanResult {
  const { engine, read } = input;
  const found = collectRefs({ address: input.address, engine, read });
  if (!found.ok) return { ok: false, refusals: [found.refusal] };
  const { report, at } = found;
  if (report.refs.length > 0) {
    const header =
      `Cannot delete '${report.target}': ${report.refs.length} reference(s) still point to it. ` +
      'Remove them first, then re-run:';
    return { ok: false, refusals: [`${header}\n${renderRefReport(report, false)}`] };
  }

  const text = read(at.file);
  const { start, end } = declarationSpan(text, at);
  const rest = text.slice(0, start) + text.slice(end);
  const hasMore = ts
    .createSourceFile(at.file, rest, ts.ScriptTarget.Latest)
    .statements.some((statement) => !ts.isImportDeclaration(statement));
  const plan = { edits: [], moves: [], deletes: [], findings: [] };
  if (hasMore) {
    return { ok: true, plan: { ...plan, edits: [{ file: at.file, start, end, text: '' }] } };
  }
  return { ok: true, plan: { ...plan, deletes: fileWithMirror(input, at.file) } };
}

function fileWithMirror(
  input: { engine: Engine; exists: (file: string) => boolean },
  file: string,
): string[] {
  const { root } = input.engine;
  const rel = relative(root, file);
  const files = expandCompanions([{ from: rel, to: rel }], companionRules, (path) =>
    input.exists(resolve(root, path)),
  );
  return files.map(({ from }) => resolve(root, from));
}
