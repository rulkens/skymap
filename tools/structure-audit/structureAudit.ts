/**
 * `npm run structure-audit` — one static HTML page over src/: area import matrix with editable tiers,
 * cycles, non-RTK state, convention/test-mirror/dead-export/duplication audits. README beside.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { walkTsFiles } from '../utils/io/walkTsFiles';
import { aggregateGraph } from './aggregateGraph';
import { auditConventions } from './auditConventions';
import { auditDeadExports } from './auditDeadExports';
import { auditDuplication } from './auditDuplication';
import { auditTestMirror } from './auditTestMirror';
import { renderPage } from './renderPage';
import { scanImportGraph } from './scanImportGraph';
import { scanState } from './scanState';
import { tierOf, TIERS } from './tierOf';
import type { StructureAuditData } from './types/StructureAuditData';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'tools', 'structure-audit', 'out', 'structureAudit.html');
const STRICT = { minLines: 8, minTokens: 60 };
const LOOSE = { minLines: 5, minTokens: 40 };

const graph = scanImportGraph(SRC);
const agg = aggregateGraph(graph);
const files = Object.keys(graph.nodes);
const testFiles = walkTsFiles(join(ROOT, 'tests'));
const others = [
  ...testFiles.map((t) => join(ROOT, 'tests', t)),
  ...walkTsFiles(join(ROOT, 'tools')).map((t) => join(ROOT, 'tools', t)),
];

const areaStats = new Map<string, { files: number; code: number }>();
for (const node of Object.values(graph.nodes)) {
  const row =
    areaStats.get(node.area) ?? areaStats.set(node.area, { files: 0, code: 0 }).get(node.area)!;
  row.files++;
  row.code += node.code;
}

const data: StructureAuditData = {
  generated: new Date().toISOString().slice(0, 10),
  totals: { files: files.length, edges: graph.edges.length },
  groups: TIERS,
  areas: [...areaStats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, s]) => ({ name, group: tierOf(name), ...s })),
  areaEdges: agg.areaEdges,
  pairFiles: agg.pairFiles,
  sccs: agg.sccs.slice(0, 40),
  sccStats: {
    count: agg.sccs.length,
    filesInCycles: agg.sccs.reduce((s, c) => s + c.size, 0),
    largest: agg.sccs[0]?.size ?? 0,
  },
  fanIn: agg.fanIn,
  fanOut: agg.fanOut,
  state: scanState(SRC, graph),
  audit: {
    conv: auditConventions(SRC, files),
    mirror: auditTestMirror(graph, testFiles),
    inst: agg.stability,
    dead: auditDeadExports(graph, { src: SRC, others }),
    dup: {
      strict: await auditDuplication(SRC, graph, STRICT),
      loose: await auditDuplication(SRC, graph, LOOSE),
    },
  },
};

mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, renderPage(data));
console.log(
  `${data.totals.files} files · ${data.totals.edges} imports · ${data.areaEdges.length} area pairs · ` +
    `${data.sccStats.count} cycles · ${data.audit.dead.dead.length} dead exports · ` +
    `${data.audit.dup.strict.clones.length} strict clones`,
);
console.log(`open ${OUT}`);
