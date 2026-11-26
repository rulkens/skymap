import ts from 'typescript';

/**
 * The `key: value` span of an object-literal property or destructure element that
 * renaming `node` to `newName` would turn into `x: x`, or undefined. The caller writes
 * `newName` over the whole span, which is the shorthand and keeps a default after it.
 */
export function collapsibleKeyValue(
  node: ts.Node,
  newName: string,
): { start: number; end: number } | undefined {
  const parent = node.parent;
  let key: ts.Node | undefined;
  let value: ts.Node | undefined;
  if (ts.isPropertyAssignment(parent)) [key, value] = [parent.name, parent.initializer];
  else if (ts.isBindingElement(parent)) [key, value] = [parent.propertyName, parent.name];
  if (!key || !value || !ts.isIdentifier(key) || !ts.isIdentifier(value)) return undefined;
  if (node !== key && node !== value) return undefined;
  const after = (side: ts.Identifier) => (side === node ? newName : side.text);
  if (after(key) !== after(value)) return undefined;
  return { start: key.getStart(), end: value.getEnd() };
}
