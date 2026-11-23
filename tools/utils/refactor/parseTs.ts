import ts from 'typescript';

let last: { file: string; text: string; source: ts.SourceFile } | undefined;

/**
 * Parses with the TypeScript 6 parser. One entry is memoised: `collectRefs` asks
 * about every reference of a file in a row, and re-parsing per reference is the cost.
 */
export function parseTs(file: string, text: string): ts.SourceFile {
  if (last && last.file === file && last.text === text) return last.source;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  last = { file, text, source };
  return source;
}
