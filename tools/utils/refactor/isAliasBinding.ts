import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';

/**
 * Is `at` the name an import or export specifier gives to something else (`bar` in
 * `foo as bar`)? That name is a different symbol, whatever it is spelled.
 */
export function isAliasBinding(text: string, at: NodeLocation): boolean {
  const node = findNameNode(parseTs(at.file, text), at);
  const parent = node?.parent;
  return (
    parent !== undefined &&
    (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) &&
    parent.propertyName !== undefined &&
    parent.name === node
  );
}
