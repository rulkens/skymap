import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportGraph } from './types/ImportGraph';
import type { StateCount, StateInventory, StateSite } from './types/StateInventory';

const MODULE_LET = /^(export )?let /;
const CONTAINER = /^(export )?const (\w+)(?::\s*([^=]+?))?\s*=\s*new (Map|Set|WeakMap)/;
const CLASS = /^\s*(export )?(abstract )?class /;
/** A `let` exactly two spaces in = directly inside a top-level function body: a factory's private cell. */
const CLOSURE_LET = /^ {2}let /gm;
const REACT_STATE = /\buse(State|Ref|Reducer)\(/g;

/** Regex inventory of state outside RTK. Heuristic by design: it points, it doesn't prove. */
export function scanState(srcDir: string, graph: ImportGraph): StateInventory {
  const moduleLet: StateSite[] = [];
  const containers: StateSite[] = [];
  const slices: StateSite[] = [];
  const classes: StateSite[] = [];
  const reactState: StateCount[] = [];
  const closure: StateCount[] = [];
  for (const [f, node] of Object.entries(graph.nodes)) {
    const source = readFileSync(join(srcDir, f), 'utf8');
    const area = node.area;
    source.split('\n').forEach((l, i) => {
      const line = i + 1;
      if (MODULE_LET.test(l)) moduleLet.push({ f, area, line, text: l.trim().slice(0, 90) });
      const c = CONTAINER.exec(l);
      if (c) {
        const name = c[2] ?? '';
        const kind = c[4] ?? '';
        const readonly = /Readonly(Map|Set)/.test(c[3] ?? '') || /^[A-Z0-9_]+$/.test(name);
        const role =
          kind === 'WeakMap' || /cache/i.test(name) ? 'cache' : readonly ? 'lookup' : 'mutable';
        containers.push({ f, area, line, name, kind, role });
      }
      if (l.includes('createSlice(')) slices.push({ f, area, line });
      if (CLASS.test(l)) classes.push({ f, area, line, text: l.trim().slice(0, 80) });
    });
    const hooks = source.match(REACT_STATE)?.length ?? 0;
    if (hooks) reactState.push({ f, area, n: hooks });
    const cells = source.match(CLOSURE_LET)?.length ?? 0;
    if (cells) closure.push({ f, area, n: cells, code: node.code });
  }
  closure.sort((a, b) => b.n - a.n);
  containers.sort((a, b) => a.role!.localeCompare(b.role!));
  return { moduleLet, containers, slices, classes, reactState, closure };
}
