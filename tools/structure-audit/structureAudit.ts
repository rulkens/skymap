/**
 * `npm run structure-audit` — one static HTML page over src/: area import matrix with editable tiers,
 * cycles, non-RTK state, convention/test-mirror/dead-export/duplication audits. README beside.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkTsFiles } from '../utils/io/walkTsFiles';
import { aggregateGraph } from './aggregateGraph';
import { auditConventions } from './auditConventions';
import { auditDeadExports } from './auditDeadExports';
import { auditDuplication } from './auditDuplication';
import { auditTestMirror } from './auditTestMirror';
import { renderPage } from './renderPage';
import { scanImportGraph } from './scanImportGraph';
import { scanState } from './scanState';
import {
  LOOSE_CLONES,
  OUT_FILE,
  ROOT,
  SRC_DIR,
  STRICT_CLONES,
  TIERS,
  TOP_CYCLES,
  TOP_HUBS,
} from './structureAuditDefaults';
import { tierOf } from './tierOf';
import type { StructureAuditData } from './@types/StructureAuditData';

const graph = scanImportGraph(SRC_DIR);
const agg = aggregateGraph(graph, TOP_HUBS);
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
  sccs: agg.sccs.slice(0, TOP_CYCLES),
  sccStats: {
    count: agg.sccs.length,
    filesInCycles: agg.sccs.reduce((s, c) => s + c.size, 0),
    largest: agg.sccs[0]?.size ?? 0,
  },
  fanIn: agg.fanIn,
  fanOut: agg.fanOut,
  state: scanState(SRC_DIR, graph),
  audit: {
    conv: auditConventions(SRC_DIR, files),
    mirror: auditTestMirror(graph, testFiles),
    inst: agg.stability,
    dead: auditDeadExports(graph, { src: SRC_DIR, others }),
    dup: {
      strict: await auditDuplication(SRC_DIR, graph, STRICT_CLONES),
      loose: await auditDuplication(SRC_DIR, graph, LOOSE_CLONES),
    },
  },
};

mkdirSync(join(OUT_FILE, '..'), { recursive: true });
writeFileSync(OUT_FILE, renderPage(data));
console.log(
  `${data.totals.files} files · ${data.totals.edges} imports · ${data.areaEdges.length} area pairs · ` +
    `${data.sccStats.count} cycles · ${data.audit.dead.dead.length} dead exports · ` +
    `${data.audit.dup.strict.clones.length} strict clones`,
);
console.log(`open ${OUT_FILE}`);
