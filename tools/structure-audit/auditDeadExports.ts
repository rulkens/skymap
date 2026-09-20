import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportedNames } from './exportedNames';
import { parseImports } from './parseImports';
import { resolveRelativeImport } from './resolveRelativeImport';
import { BUNDLE_ENTRIES } from './structureAuditDefaults';
import type { DeadExportAudit } from './@types/DeadExportAudit';
import type { DeadExportRoots } from './@types/DeadExportRoots';
import type { ExportRef } from './@types/ExportRef';
import type { FileRef } from './@types/FileRef';
import type { ImportGraph } from './@types/ImportGraph';

/**
 * Exported names nothing imports. `src` usage is authoritative; `others` (tests/, tools/) only
 * moves a symbol from "dead" to "test-only". A component's own `Props` type is exempt.
 */
export function auditDeadExports(graph: ImportGraph, roots: DeadExportRoots): DeadExportAudit {
  const files = Object.keys(graph.nodes);
  const known = new Set(files);
  const exportsOf = new Map<string, Set<string>>();
  for (const f of files) {
    const source = readFileSync(join(roots.src, f), 'utf8');
    exportsOf.set(f, new Set(exportedNames(source)));
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
    if (BUNDLE_ENTRIES.has(f) || names.size === 0) continue;
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
