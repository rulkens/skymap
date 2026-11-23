import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * The edit that renames one reference. An object shorthand `{ foo }` keeps its key, so
 * it becomes `{ foo: newName }`; everywhere else, import and export specifiers included,
 * the identifier is replaced in place (an alias `foo as bar` is never a reference here).
 */
export function renameEdit(text: string, at: NodeLocation, newName: string): TextEdit {
  const node = findNameNode(parseTs(at.file, text), at);
  const shorthand = node?.parent && ts.isShorthandPropertyAssignment(node.parent);
  const replacement = shorthand ? `${text.slice(at.start, at.end)}: ${newName}` : newName;
  return { file: at.file, start: at.start, end: at.end, text: replacement };
}
