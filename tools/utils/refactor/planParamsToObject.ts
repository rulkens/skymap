/**
 * planParamsToObject: turn an exported function's positional parameters into one
 * destructured object, and every call into an object literal, as a plan.
 *
 * It classifies the references the driver already has: a `call` is rewritten, an import
 * or re-export needs nothing, and every other use (a callback, an alias, `typeof f`) is a
 * refusal, since only a call has arguments to reshape. Refusals are collected so one run
 * lists every site to fix. Calls whose edits would overlap (`area(area(1, 2), 3)`) refuse
 * rather than compose, because the outer edit is built from the original text.
 */

import ts from 'typescript';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { ParamsDeclarationEdit } from '../../@types/refactor/ParamsDeclarationEdit';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { callArgumentsEdit } from './callArgumentsEdit';
import { findNameNode } from './findNameNode';
import { objectParamText } from './objectParamText';
import { parseTs } from './parseTs';

export function planParamsToObject(input: {
  address: SymbolAddress;
  found: FoundRefs;
  read: (file: string) => string;
}): PlanResult {
  const { address, found, read } = input;
  const { at, report } = found;
  const refusals: string[] = [];
  const edits: TextEdit[] = [];
  const sites = new Map<TextEdit, string>();

  const declaration = declarationEdit(read(at.file), at);
  const file = report.target.split('#')[0]!;
  if (!declaration.ok) refusals.push(`${file}:${declaration.line}  ${declaration.refusal}`);
  else edits.push({ file: at.file, ...declaration.edit });

  found.refs.forEach((ref, i) => {
    const row = report.refs[i]!;
    const place = `${row.filePath}:${row.line}:${row.column}`;
    if (row.kind === 'import' || row.kind === 're-export') return;
    if (row.kind !== 'call') return void refusals.push(`${place}  ${row.kind}: not a call.`);
    if (!declaration.ok) return;
    const result = callArgumentsEdit(read(ref.file), ref, declaration.names);
    if (!result.ok) return void refusals.push(`${place}  call: ${result.refusal}`);
    edits.push(result.edit);
    sites.set(result.edit, place);
  });

  const ordered = [...edits].sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  ordered.forEach((edit, i) => {
    const prev = ordered[i - 1];
    if (prev && prev.file === edit.file && edit.start < prev.end) {
      const place = sites.get(edit) ?? sites.get(prev) ?? file;
      refusals.push(`${place}  call: nested inside another edited call.`);
    }
  });

  if (refusals.length > 0) {
    return {
      ok: false,
      refusals: [
        `Cannot convert '${address.symbol}': ${refusals.length} site(s) block it.`,
        ...refusals,
      ],
    };
  }
  return { ok: true, plan: { edits, moves: [], deletes: [], findings: [] } };
}

// The edit to the parameter list of the function declared at `at`, or why it cannot be one.
function declarationEdit(
  text: string,
  at: { file: string; start: number; end: number },
): ParamsDeclarationEdit {
  const source = parseTs(at.file, text);
  const name = findNameNode(source, at);
  const parent = name?.parent;
  const line = source.getLineAndCharacterOfPosition(at.start).line + 1;
  const no = (refusal: string): ParamsDeclarationEdit => ({ ok: false, line, refusal });

  let fn: ts.SignatureDeclaration | undefined;
  if (parent && ts.isFunctionDeclaration(parent)) {
    const siblings = source.statements.filter(
      (s) => ts.isFunctionDeclaration(s) && s.name?.text === parent.name?.text,
    );
    if (siblings.length > 1) return no('the function has overload signatures.');
    fn = parent;
  } else if (parent && ts.isVariableDeclaration(parent)) {
    if (parent.type)
      return no("the const has a type annotation: its shape is another type's contract.");
    const init = parent.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) fn = init;
  }
  if (!fn) return no('not an exported function declaration or const function.');

  const first = fn.parameters[0];
  const last = fn.parameters[fn.parameters.length - 1];
  if (!first || !last) return no('nothing to gain: no parameters.');
  const start = first.getStart(source);
  const end = last.getEnd();
  const params = objectParamText(text, { start, end });
  if (!params.ok) return no(params.refusal);
  return { ok: true, edit: { start, end, text: params.text }, names: params.names };
}
