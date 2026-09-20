import { createRequire } from 'node:module';
import { posix, relative } from 'node:path';
import type { ImportGraph } from './@types/ImportGraph';
import type { Clone } from './@types/Clone';
import type { CloneThreshold } from './@types/CloneThreshold';
import type { CloneReport } from './@types/CloneReport';

/** jscpd's ESM build does named imports from the CJS `colors/safe`, which Node rejects; the CJS build is fine. */
const { detectClones } = createRequire(import.meta.url)('jscpd') as typeof import('jscpd');

/** jscpd exact token clones over `srcDir`; identifiers count, so a copy with one rename is missed. */
export async function auditDuplication(
  srcDir: string,
  graph: ImportGraph,
  threshold: CloneThreshold,
): Promise<CloneReport> {
  const found = await detectClones({
    path: [srcDir],
    minLines: threshold.minLines,
    minTokens: threshold.minTokens,
    format: ['typescript', 'tsx'],
    silent: true,
    reporters: [],
  });
  const rel = (abs: string): string => posix.normalize(relative(srcDir, abs));
  const clones: Clone[] = found
    .map((d) => {
      const a = rel(d.duplicationA.sourceId);
      const b = rel(d.duplicationB.sourceId);
      const lines = d.duplicationA.end.line - d.duplicationA.start.line + 1;
      const sample = (d.duplicationA.fragment ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ')
        .slice(0, 160);
      return {
        a,
        la: d.duplicationA.start.line,
        b,
        lb: d.duplicationB.start.line,
        lines,
        tokens: d.duplicationA.range[1] - d.duplicationA.range[0],
        areaA: graph.nodes[a]?.area ?? '?',
        areaB: graph.nodes[b]?.area ?? '?',
        sample,
      };
    })
    .sort((x, y) => y.lines - x.lines);
  const totalLines = Object.values(graph.nodes).reduce((s, n) => s + n.lines, 0);
  return { clones, duplicatedLines: clones.reduce((s, c) => s + c.lines, 0), totalLines };
}
