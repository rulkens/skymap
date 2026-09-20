import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseImports } from './parseImports';
import { resolveRelativeImport } from './resolveRelativeImport';
import type { DeadExportAudit, ExportRef, FileRef } from './types/DeadExportAudit';
import type { ImportGraph } from './types/ImportGraph';

const EXPORT_DECL =
  /^export (?:const|function|async function|type|class|enum|let|abstract class) (\w+)/gm;
const EXPORT_LIST = /^export \{([^}]+)\}(?!\s*from)/gm;
/** Bundle entry points: nothing imports them by design. */
const ENTRIES = new Set(['main.tsx', 'worker.ts', 'unsupportedPage.ts']);

type Roots = { readonly src: string; readonly others: readonly string[] };

/**
 * Exported names nothing imports. `src` usage is authoritative; `others` (tests/, tools/) only
 * moves a symbol from "dead" to "test-only". A component's own `Props` type is exempt.
 */
export function auditDeadExports(graph: ImportGraph, roots: Roots): DeadExportAudit {
  const files = Object.keys(graph.nodes);
  const known = new Set(files);
  const exportsOf = new Map<string, Set<string>>();
  for (const f of files) {
    const source = readFileSync(join(roots.src, f), 'utf8');
    const names = new Set<string>();
    for (const m of source.matchAll(EXPORT_DECL)) if (m[1]) names.add(m[1]);
    for (const m of source.matchAll(EXPORT_LIST))
      for (const part of (m[1] ?? '').split(',')) {
        const exported = part
          .trim()
          .split(/\s+as\s+/)
          .pop();
        if (exported) names.add(exported);
      }
    if (/^export default /m.test(source)) names.add('default');
    exportsOf.set(f, names);
  }

  const mark = (importerAbs: string, source: string, into: Map<string, Set<string>>): void => {
    for (const imp of parseImports(source)) {
      const target = resolveRelativeImport(importerAbs, imp.spec, roots.src, known);
      if (!target) continue;
      const set = into.get(target) ?? into.set(target, new Set()).get(target)!;
      for (const n of imp.names) set.add(n);
    }
  };
  const usedInSrc = new Map<string, Set<string>>();
  const usedElsewhere = new Map<string, Set<string>>();
  for (const f of files)
    mark(join(roots.src, f), readFileSync(join(roots.src, f), 'utf8'), usedInSrc);
  for (const abs of roots.others) mark(abs, readFileSync(abs, 'utf8'), usedElsewhere);

  const dead: ExportRef[] = [];
  const testOnly: ExportRef[] = [];
  const deadFiles: FileRef[] = [];
  const testOnlyFiles: FileRef[] = [];
  for (const [f, names] of exportsOf) {
    if (ENTRIES.has(f) || names.size === 0) continue;
    const area = graph.nodes[f]?.area ?? '?';
    const src = usedInSrc.get(f) ?? new Set<string>();
    const other = usedElsewhere.get(f) ?? new Set<string>();
    if (src.size === 0)
      (other.size ? testOnlyFiles : deadFiles).push({ f, area, exports: names.size });
    if (src.has('*')) continue;
    for (const name of names) {
      if (src.has(name)) continue;
      if (f.endsWith('.tsx') && name.endsWith('Props')) continue;
      (other.has('*') || other.has(name) ? testOnly : dead).push({ f, name, area });
    }
  }
  return { dead, testOnly, deadFiles, testOnlyFiles };
}
