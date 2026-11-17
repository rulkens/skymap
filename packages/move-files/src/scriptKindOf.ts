import ts from 'typescript';

/** How to parse a file. JS files may hold JSX, whose text would derail a parse in TS mode. */
export function scriptKindOf(path: string): ts.ScriptKind {
  if (/\.[cm]?jsx?$/.test(path)) return ts.ScriptKind.JSX;
  return path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}
