import { basename, dirname } from 'node:path';
import type { ImportGraph } from './@types/ImportGraph';
import type { TestMirror } from './@types/TestMirror';

/**
 * Presence, not coverage: a src file is mirrored when `tests/<same dir>/<stem>.test.ts(x)` or a
 * suffixed sibling (`<stem>.<facet>.test.ts`) exists.
 */
export function auditTestMirror(graph: ImportGraph, testFiles: readonly string[]): TestMirror[] {
  const byDir = new Map<string, string[]>();
  for (const t of testFiles) {
    if (!/\.test\.tsx?$/.test(t)) continue;
    const d = dirname(t);
    (byDir.get(d) ?? byDir.set(d, []).get(d)!).push(basename(t));
  }
  const mirror = new Map<string, { files: number; tested: number; untested: string[] }>();
  for (const [f, node] of Object.entries(graph.nodes)) {
    if (f.endsWith('.d.ts')) continue;
    const stem = basename(f).replace(/\.tsx?$/, '');
    const twins = byDir.get(dirname(f)) ?? [];
    const tested = twins.some((t) => t.startsWith(`${stem}.`));
    const row =
      mirror.get(node.area) ??
      mirror.set(node.area, { files: 0, tested: 0, untested: [] }).get(node.area)!;
    row.files++;
    if (tested) row.tested++;
    else row.untested.push(f);
  }
  return [...mirror.entries()].map(([area, r]) => ({ area, ...r }));
}
