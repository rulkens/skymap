import { dirname } from 'node:path';
import { DiagnosticCategory } from 'typescript-native/unstable/sync';
import type { Engine } from '../../../@types/refactor/Engine';
import type { TypeError } from '../../../@types/refactor/TypeError';
import { engineHandle } from './engineHandle';

/**
 * The semantic errors of `files` as the overlay stands, each site once. Each file is asked
 * of the first project that owns it: one whose program holds it and whose config folder
 * contains it. The website project also pulls in `src/` without the WebGPU and `?static`
 * ambient types and would report hundreds of errors there that `src/`'s own project does
 * not have; a file owned by none is skipped, as are dependency files.
 */
export function findTypeErrors(engine: Engine, files: readonly string[]): readonly TypeError[] {
  const { snapshot } = engineHandle(engine);
  const projects = snapshot.getProjects();
  const seen = new Map<string, TypeError>();
  for (const file of files) {
    if (file.includes('/node_modules/')) continue;
    const owner = projects.find(
      (p) => file.startsWith(`${dirname(p.configFileName)}/`) && p.program.getSourceFile(file),
    );
    const source = owner?.program.getSourceFile(file);
    if (!owner || !source) continue;
    for (const diagnostic of owner.program.getSemanticDiagnostics(file)) {
      if (diagnostic.category !== DiagnosticCategory.Error) continue;
      const key = `${source.fileName}:${diagnostic.pos}:${diagnostic.code}`;
      if (seen.has(key)) continue;
      const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.pos);
      seen.set(key, {
        file: source.fileName,
        line: line + 1,
        column: character + 1,
        message: `TS${diagnostic.code}: ${diagnostic.text.split('\n')[0]}`,
      });
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
}
