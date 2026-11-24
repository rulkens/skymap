import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * Rewrites the argument list of the plain call whose callee token is `call` into one
 * object literal keyed by `names`: `area(a, b)` becomes `area({ width: a, height: b })`.
 * Each argument's own text is kept verbatim, comments and line breaks included, and an
 * identifier that already has the key's name becomes a shorthand. The callee may be a
 * namespace member (`ns.area(...)`) and carry type arguments; both stay as written. An
 * optional call (`?.`), a `new` or a name that is not called refuses.
 */
export function callArgumentsEdit(
  text: string,
  call: NodeLocation,
  names: readonly string[],
): { ok: true; edit: TextEdit } | { ok: false; refusal: string } {
  const source = parseTs(call.file, text);
  const node = findNameNode(source, call);
  let callee = node;
  if (node?.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
    callee = node.parent;
  }
  const parent = callee?.parent;
  if (parent && ts.isNewExpression(parent)) {
    return { ok: false, refusal: 'a `new` is not a function call.' };
  }
  if (!parent || !ts.isCallExpression(parent) || parent.expression !== callee) {
    return { ok: false, refusal: 'not a plain call of the name.' };
  }
  if (parent.questionDotToken) return { ok: false, refusal: 'an optional call (`?.`).' };

  const args = parent.arguments;
  if (args.some(ts.isSpreadElement)) return { ok: false, refusal: 'an argument is a spread.' };
  if (args.length > names.length) {
    return {
      ok: false,
      refusal: `passes ${args.length} arguments to a function of ${names.length} parameters.`,
    };
  }
  for (let i = 1; i < args.length; i++) {
    if (!/^\s*,\s*$/.test(text.slice(args[i - 1]!.getEnd(), args[i]!.getStart(source)))) {
      return { ok: false, refusal: 'a comment between arguments would be lost.' };
    }
  }
  const fields = args.map((arg, i) => {
    const name = names[i]!;
    const value = text.slice(arg.getStart(source), arg.getEnd());
    return ts.isIdentifier(arg) && arg.text === name ? name : `${name}: ${value}`;
  });
  const literal = fields.length > 0 ? `{ ${fields.join(', ')} }` : '{}';
  const first = args[0];
  const last = args[args.length - 1];
  const start = first ? first.getStart(source) : parent.getEnd() - 1;
  const end = last ? last.getEnd() : start;
  return { ok: true, edit: { file: call.file, start, end, text: literal } };
}
