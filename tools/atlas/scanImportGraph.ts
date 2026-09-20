import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkTsFiles } from '../utils/io/walkTsFiles';
import { areaOf } from './areaOf';
import { parseImports } from './parseImports';
import { resolveRelativeImport } from './resolveRelativeImport';
import type { FileNode } from './types/FileNode';
import type { ImportEdge } from './types/ImportEdge';
import type { ImportGraph } from './types/ImportGraph';

/** Relative-import graph of `srcDir`. Shader `package::` imports and string paths are invisible here. */
export function scanImportGraph(srcDir: string): ImportGraph {
  const files = walkTsFiles(srcDir);
  const known = new Set(files);
  const nodes: Record<string, FileNode> = {};
  const edges: ImportEdge[] = [];
  for (const f of files) {
    const source = readFileSync(join(srcDir, f), 'utf8');
    const lines = source.split('\n');
    const code = lines.filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;
    nodes[f] = { area: areaOf(f), lines: lines.length, code };
    for (const imp of parseImports(source)) {
      const to = resolveRelativeImport(join(srcDir, f), imp.spec, srcDir, known);
      if (to) edges.push({ from: f, to, typeOnly: imp.typeOnly });
    }
  }
  return { nodes, edges };
}
