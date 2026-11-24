import { dirname } from 'node:path';
import { DiagnosticCategory } from 'typescript-native/unstable/sync';
import type { Engine } from '../../../@types/refactor/Engine';
import type { TypeErrorSite } from '../../../@types/refactor/TypeErrorSite';
import { engineHandle } from './engineHandle';

/**
 * The syntax and semantic errors of `files` as the overlay stands. Each file is asked of
 * the first project that owns it: one whose program holds it and whose config folder
 * contains it. The website project also pulls in `src/` without the WebGPU and `?static`
 * ambient types and would report hundreds of errors there that `src/`'s own project does
 * not have; a file owned by none is skipped, as are dependency files.
 */
export function findTypeErrors(engine: Engine, files: readonly string[]): readonly TypeErrorSite[] {
  const { snapshot } = engineHandle(engine);
  const projects = snapshot.getProjects();
  const found: TypeErrorSite[] = [];
  for (const file of files) {
    if (file.includes('/node_modules/')) continue;
    const owner = projects.find(
      (p) => file.startsWith(`${dirname(p.configFileName)}/`) && p.program.getSourceFile(file),
    );
    const source = owner?.program.getSourceFile(file);
    if (!owner || !source) continue;
    // A broken parse still yields a tree, so the semantic pass alone can report nothing.
    const diagnostics = [
      ...owner.program.getSyntacticDiagnostics(file),
      ...owner.program.getSemanticDiagnostics(file),
    ];
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== DiagnosticCategory.Error) continue;
      const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.pos);
      found.push({
        file: source.fileName,
        line: line + 1,
        column: character + 1,
        message: `TS${diagnostic.code}: ${diagnostic.text.split('\n')[0]}`,
      });
    }
  }
  return found.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
}
