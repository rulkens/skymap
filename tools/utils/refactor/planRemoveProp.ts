/**
 * planRemoveProp: repo-wide removal of one property of an exported type, as a plan.
 *
 * A property can only go when nothing reads it, so every read, destructure and string
 * key is a refusal. The writes that build or assign it are cut with the property, unless
 * their value does work (a call, `new`, `await`, a tagged template, an assignment), which
 * removing would silently drop. All refusals come back together, one per use. A cut
 * shorthand leaves its local, and a `{@link}` leaves a mention: both come back as findings.
 */

import ts from 'typescript';
import type { Finding } from '../../@types/refactor/Finding';
import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { findNameNode } from './findNameNode';
import { hasSideEffect } from './hasSideEffect';
import { memberSpan } from './memberSpan';
import { parseTs } from './parseTs';

const CUTTABLE = new Set(['write', 'shorthand-write']);

export function planRemoveProp(input: {
  address: PropAddress;
  found: FoundPropRefs;
  read: (file: string) => string;
}): PlanResult {
  const { address, found, read } = input;
  const refusals: string[] = [];
  const findings: Finding[] = [...found.unreported];
  const cuts: TextEdit[] = [];
  found.refs.forEach((ref, i) => {
    const row = found.report.refs[i]!;
    const place = `${row.filePath}:${row.line}:${row.column}  ${ref.kind}`;
    if (ref.kind === 'doc-link') {
      return void findings.push({
        file: row.filePath,
        line: row.line,
        message: 'still mentioned in a doc comment',
      });
    }
    if (!CUTTABLE.has(ref.kind)) return void refusals.push(`${place}: still used`);
    const text = read(ref.at.file);
    const why = ref.kind === 'write' ? writeRefusal(text, ref.at) : undefined;
    if (why) return void refusals.push(`${place}: ${why}`);
    if (ref.kind === 'shorthand-write') {
      findings.push({
        file: row.filePath,
        line: row.line,
        message: `local '${address.prop}' may now be unused`,
      });
    }
    cuts.push({ file: ref.at.file, ...memberSpan(text, ref.at), text: '' });
  });
  if (refusals.length > 0) {
    return {
      ok: false,
      refusals: [
        `Cannot remove '${address.typeName}.${address.prop}': ${refusals.length} use(s) block it.`,
        ...refusals,
      ],
    };
  }
  const { at } = found;
  cuts.push({ file: at.file, ...memberSpan(read(at.file), at), text: '' });
  // A write nested in another cut write (a recursive type) goes with it.
  const edits = cuts.filter(
    (cut) =>
      !cuts.some(
        (o) =>
          o !== cut &&
          o.file === cut.file &&
          o.start <= cut.start &&
          cut.end <= o.end &&
          (o.start < cut.start || cut.end < o.end),
      ),
  );
  return { ok: true, plan: { edits, moves: [], deletes: [], findings } };
}

const SIDE_EFFECT = 'removing it would drop a side effect in its value';

// Why this write cannot simply be cut, or undefined when it can. A `write` is a property
// assignment, a JSX attribute or a property access that is assigned.
function writeRefusal(
  text: string,
  at: { file: string; start: number; end: number },
): string | undefined {
  const parent = findNameNode(parseTs(at.file, text), at)!.parent;
  if (ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) {
    return hasSideEffect(parent.initializer) ? SIDE_EFFECT : undefined;
  }
  const access = parent as ts.PropertyAccessExpression;
  const assignment = access.parent;
  const statement = assignment.parent;
  const whole =
    ts.isBinaryExpression(assignment) &&
    assignment.left === access &&
    assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isExpressionStatement(statement) &&
    (ts.isBlock(statement.parent) ||
      ts.isSourceFile(statement.parent) ||
      ts.isModuleBlock(statement.parent) ||
      ts.isCaseClause(statement.parent) ||
      ts.isDefaultClause(statement.parent));
  if (!whole) return 'only a plain `a.prop = value;` statement can be cut';
  return hasSideEffect(assignment.right) || hasSideEffect(access.expression)
    ? SIDE_EFFECT
    : undefined;
}
