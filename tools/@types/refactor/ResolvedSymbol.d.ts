import type { ExportedDeclarations, SourceFile } from 'ts-morph';

export type ResolvedSymbol = {
  readonly sourceFile: SourceFile;
  readonly declaration: ExportedDeclarations;
  readonly name: string;
};
