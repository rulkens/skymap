import ts from 'typescript';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import { findNameNode } from './findNameNode';
import { locateExport } from './locateExport';
import { parseTs } from './parseTs';

/**
 * The property's name token inside the exported type, or a refusal message. A string-keyed
 * member (`'radius': number`) is located inside its quotes, where the engine reports it.
 */
export function locateProp(
  text: string,
  address: PropAddress,
): { ok: true; at: NodeLocation } | { ok: false; refusal: string } {
  const label = `${address.file}#${address.typeName}.${address.prop}`;
  const located = locateExport(text, { file: address.file, symbol: address.typeName });
  if (!located.ok) return located;
  const source = parseTs(address.file, text);
  const declaration = findNameNode(source, located.at)?.parent;
  let members: readonly ts.TypeElement[] | undefined;
  if (declaration && ts.isInterfaceDeclaration(declaration)) members = declaration.members;
  else if (declaration && ts.isTypeAliasDeclaration(declaration)) {
    if (ts.isTypeLiteralNode(declaration.type)) members = declaration.type.members;
  }
  if (!members) {
    return {
      ok: false,
      refusal: `Cannot resolve '${label}': '${address.typeName}' is not an object type literal or interface (a union, an intersection or a mapped type has no direct members).`,
    };
  }
  const names: string[] = [];
  for (const member of members) {
    const name = member.name;
    if (!name || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) continue;
    names.push(name.text);
    if (name.text !== address.prop) continue;
    const inQuotes = ts.isStringLiteral(name) ? 1 : 0;
    const start = name.getStart(source) + inQuotes;
    return { ok: true, at: { file: address.file, start, end: name.getEnd() - inQuotes } };
  }
  return {
    ok: false,
    refusal: `Cannot resolve '${label}': '${address.typeName}' has no direct member '${address.prop}'. Members: ${names.join(', ') || '(none)'}.`,
  };
}
