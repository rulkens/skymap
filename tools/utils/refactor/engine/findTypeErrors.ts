import { dirname } from 'node:path';
import { DiagnosticCategory } from 'typescript-native/unstable/sync';
import type { Engine } from '../../../@types/refactor/Engine';
import type { TypeError } from '../../../@types/refactor/TypeError';
import { engineHandle } from './engineHandle';

/**
 * Every semantic error in the engine's projects as the overlay stands, each site once.
 * A file in two projects is checked twice, so sites are keyed by file, offset and code;
 * dependency files and diagnostics without a file are not the repo's to fix. A project
 * answers only for files under its own folder: the website project pulls in `src/` without
 * the WebGPU and `?static` ambient types and reports hundreds of errors there that its own
 * `src/` project does not have.
 */
export function findTypeErrors(engine: Engine): readonly TypeError[] {
  const { snapshot } = engineHandle(engine);
  const seen = new Map<string, TypeError>();
  for (const project of snapshot.getProjects()) {
    const home = `${dirname(project.configFileName)}/`;
    for (const diagnostic of project.program.getSemanticDiagnostics()) {
      if (diagnostic.category !== DiagnosticCategory.Error || !diagnostic.fileName) continue;
      const source = project.program.getSourceFile(diagnostic.fileName);
      if (!source || !source.fileName.startsWith(home)) continue;
      if (source.fileName.includes('/node_modules/')) continue;
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
