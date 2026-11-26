import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/** Is `at` inside an `export { x }` list of its own file, not a re-export from a module? */
export function isLocalExportSpecifier(text: string, at: NodeLocation): boolean {
  for (let up = findNameNode(parseTs(at.file, text), at); up; up = up.parent) {
    if (ts.isExportSpecifier(up)) {
      const list = up.parent.parent;
      return ts.isExportDeclaration(list) && list.moduleSpecifier === undefined;
    }
  }
  return false;
}
