/** Every module specifier a TS file names: imports, re-exports and string-literal `import()`. */
import { SyntaxKind } from 'ts-morph';
import { parseOnlyProject } from './parseOnlyProject';

export function tsSpecifiers(file: string): string[] {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  const dynamic = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
    .map((call) => call.getArguments()[0])
    .filter((arg) => arg?.getKind() === SyntaxKind.StringLiteral)
    .map((arg) => arg!.getText().slice(1, -1));
  return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((spec): spec is string => spec !== undefined)
    .concat(dynamic);
}
