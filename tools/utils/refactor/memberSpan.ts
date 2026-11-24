import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { attachedStart } from './attachedStart';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * The span to cut so the member named at `at` disappears cleanly from its list: a type or
 * interface member, an object-literal property (shorthand too), a JSX attribute, or the
 * expression statement of `a.radius = 3;`. A member alone on its lines takes the lines and
 * its own leading comments, whatever the separator; one sharing a line takes one separator
 * or space; a sole member leaves `{}`. The module header comment at offset 0 stays.
 */
export function memberSpan(text: string, at: NodeLocation): { start: number; end: number } {
  const source = parseTs(at.file, text);
  let member = findNameNode(source, at);
  while (member && !isMember(member)) member = member.parent;
  if (!member || member === source) {
    throw new Error(`No property or statement at offset ${at.start} of ${at.file}.`);
  }

  const list = siblings(member);
  if (list?.length === 1) return { start: list.pos, end: member.parent.getEnd() - 1 };

  const start = attachedStart(text, member, source);
  let end = member.getEnd();
  if (ts.isObjectLiteralExpression(member.parent)) {
    end += /^[ \t]*,/.exec(text.slice(end))?.[0].length ?? 0;
  }
  const trailing = ts.getTrailingCommentRanges(text, end) ?? [];
  if (trailing.length > 0) end = trailing[trailing.length - 1]!.end;

  const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const rest = /^[ \t]*(\r?\n|$)/.exec(text.slice(end));
  if (rest && /^[ \t]*$/.test(text.slice(lineStart, start))) {
    let to = end + rest[0].length;
    // Cutting between two blank lines would leave two in a row.
    if (/(^|\n\n)$/.test(text.slice(0, lineStart)) && text[to] === '\n') to++;
    return { start: lineStart, end: to };
  }

  const own = member.getEnd();
  if (!list) {
    if (text[own] === ' ') return { start, end: own + 1 };
    return { start: text[start - 1] === ' ' ? start - 1 : start, end: own };
  }
  const i = list.indexOf(member);
  const next = list[i + 1];
  if (next) return { start, end: next.getStart(source) };
  return { start: list[i - 1]!.getEnd(), end: own };
}

function isMember(node: ts.Node): boolean {
  return (
    ts.isPropertySignature(node) ||
    ts.isPropertyAssignment(node) ||
    ts.isShorthandPropertyAssignment(node) ||
    ts.isJsxAttribute(node) ||
    ts.isExpressionStatement(node)
  );
}

function siblings(member: ts.Node): ts.NodeArray<ts.Node> | undefined {
  const parent = member.parent;
  if (
    ts.isPropertySignature(member) &&
    (ts.isTypeLiteralNode(parent) || ts.isInterfaceDeclaration(parent))
  ) {
    return parent.members;
  }
  if (ts.isObjectLiteralExpression(parent)) return parent.properties;
  return undefined;
}
