import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { PropUseKind } from '../../@types/refactor/PropUseKind';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

const ASSIGNMENTS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** `text` is the file's text; `at` one reference to the property inside it. */
export function classifyPropUse(text: string, at: NodeLocation): PropUseKind {
  const node = findNameNode(parseTs(at.file, text), at);
  const parent = node?.parent;
  if (!node || !parent) return 'read';

  if (ts.isStringLiteralLike(node)) {
    if (ts.isPropertyAssignment(parent) && parent.name === node) return keyKind(parent);
    if (ts.isBindingElement(parent) && parent.propertyName === node) return 'destructure';
    return 'string-key';
  }
  if (ts.isShorthandPropertyAssignment(parent)) {
    return parent.objectAssignmentInitializer || targetsAssignment(parent.parent)
      ? 'shorthand-destructure'
      : 'shorthand-write';
  }
  if (ts.isPropertyAssignment(parent) && parent.name === node) return keyKind(parent);
  if (ts.isBindingElement(parent)) {
    return parent.propertyName === node ? 'destructure' : 'shorthand-destructure';
  }
  if (ts.isJsxAttribute(parent)) return 'write';
  if (ts.isPropertyAccessExpression(parent) && parent.name === node && isWritten(parent)) {
    return 'write';
  }
  return 'read';
}

// `{ radius: 1 }` builds a value; `({ radius: r } = a)` takes one apart.
function keyKind(assignment: ts.PropertyAssignment): PropUseKind {
  return targetsAssignment(assignment.parent) ? 'destructure' : 'write';
}

// Is this object literal the left side of a destructuring assignment, however nested?
function targetsAssignment(literal: ts.Node): boolean {
  let child: ts.Node = literal;
  for (let up = child.parent; up; child = up, up = up.parent) {
    if (ts.isBinaryExpression(up)) {
      return up.left === child && up.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    }
    if (ts.isForOfStatement(up) || ts.isForInStatement(up)) return up.initializer === child;
    const nested =
      ts.isArrayLiteralExpression(up) ||
      ts.isParenthesizedExpression(up) ||
      ts.isSpreadElement(up) ||
      ts.isSpreadAssignment(up) ||
      ts.isObjectLiteralExpression(up) ||
      (ts.isPropertyAssignment(up) && up.initializer === child) ||
      (ts.isShorthandPropertyAssignment(up) && up.objectAssignmentInitializer === child);
    if (!nested) return false;
  }
  return false;
}

// `a.radius = x`, `a.radius += x`, `a.radius++`, `delete a.radius`; a read anywhere else.
function isWritten(access: ts.PropertyAccessExpression): boolean {
  let child: ts.Node = access;
  while (child.parent && ts.isParenthesizedExpression(child.parent)) child = child.parent;
  const up = child.parent;
  if (!up) return false;
  if (ts.isBinaryExpression(up)) return up.left === child && ASSIGNMENTS.has(up.operatorToken.kind);
  if (ts.isDeleteExpression(up)) return true;
  if (ts.isPrefixUnaryExpression(up) || ts.isPostfixUnaryExpression(up)) {
    return (
      up.operator === ts.SyntaxKind.PlusPlusToken || up.operator === ts.SyntaxKind.MinusMinusToken
    );
  }
  return false;
}
