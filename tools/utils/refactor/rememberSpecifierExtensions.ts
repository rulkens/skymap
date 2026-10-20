/**
 * rememberSpecifierExtensions — notes every relative import/export that names
 * its file extension (`./Card.tsx`, `../utils/clamp.ts`) and returns a restore
 * step that puts the extension back after `SourceFile.move()`. ts-morph always
 * writes the rewritten specifier without one, and the website's runtime
 * imports carry theirs (Astro/Vite, `allowImportingTsExtensions`).
 */
import type { ExportDeclaration, ImportDeclaration, Project } from 'ts-morph';

const EXTENSION = /\.(tsx?|jsx?|mts|mjs)$/;

export function rememberSpecifierExtensions(project: Project): () => void {
  const named: [ImportDeclaration | ExportDeclaration, string][] = [];
  for (const file of project.getSourceFiles()) {
    for (const decl of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
      const spec = decl.getModuleSpecifierValue();
      const ext = spec?.startsWith('.') ? EXTENSION.exec(spec)?.[0] : undefined;
      if (ext) named.push([decl, ext]);
    }
  }
  return () => {
    for (const [decl, ext] of named) {
      if (decl.wasForgotten()) continue;
      const spec = decl.getModuleSpecifierValue()!;
      if (!EXTENSION.test(spec)) decl.setModuleSpecifier(spec + ext);
    }
  };
}
