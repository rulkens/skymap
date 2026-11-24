import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { TextEdit } from '../../@types/refactor/TextEdit';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * The edit that renames one reference. An object shorthand `{ foo }` keeps its key, so
 * it becomes `{ foo: newName }`; a destructure `{ foo }` reads the key, so it becomes
 * `{ newName: foo }` (the engine does not return the local's later uses). Everywhere
 * else, import and export specifiers included, the identifier is replaced in place.
 */
export function renameEdit(text: string, at: NodeLocation, newName: string): TextEdit {
  const node = findNameNode(parseTs(at.file, text), at);
  const old = text.slice(at.start, at.end);
  const parent = node?.parent;
  let replacement = newName;
  if (parent && ts.isShorthandPropertyAssignment(parent)) replacement = `${old}: ${newName}`;
  else if (parent && ts.isBindingElement(parent) && !parent.propertyName) {
    replacement = `${newName}: ${old}`;
  }
  return { file: at.file, start: at.start, end: at.end, text: replacement };
}
