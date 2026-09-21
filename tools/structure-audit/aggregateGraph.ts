import { stronglyConnectedComponents } from './stronglyConnectedComponents';
import type { GraphAggregate } from './@types/GraphAggregate';
import type { ImportGraph } from './@types/ImportGraph';

/** Area-level view of the file graph: cross-area counts, instability, cycles and hub files. */
export function aggregateGraph(graph: ImportGraph, topHubs: number): GraphAggregate {
  const areaEdges = new Map<string, { s: string; t: string; n: number; typeOnly: number }>();
  const pairFiles: Record<string, [string, string, boolean][]> = {};
  const stab = new Map<string, { ca: number; ce: number }>();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const areaOfFile = (f: string): string => graph.nodes[f]?.area ?? '?';

  for (const e of graph.edges) {
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
    (adjacency.get(e.from) ?? adjacency.set(e.from, []).get(e.from)!).push(e.to);
    const s = areaOfFile(e.from);
    const t = areaOfFile(e.to);
    if (s === t) continue;
    const key = `${s}|${t}`;
    const row = areaEdges.get(key) ?? { s, t, n: 0, typeOnly: 0 };
    row.n++;
    if (e.typeOnly) row.typeOnly++;
    areaEdges.set(key, row);
    (pairFiles[key] ??= []).push([e.from, e.to, e.typeOnly]);
    (stab.get(s) ?? stab.set(s, { ca: 0, ce: 0 }).get(s)!).ce++;
    (stab.get(t) ?? stab.set(t, { ca: 0, ce: 0 }).get(t)!).ca++;
  }

  const sccs = stronglyConnectedComponents(Object.keys(graph.nodes), adjacency).map((files) => ({
    size: files.length,
    areas: [...new Set(files.map(areaOfFile))],
    files,
  }));
  const top = (m: ReadonlyMap<string, number>): [string, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, topHubs);

  return {
    areaEdges: [...areaEdges.values()],
    pairFiles,
    stability: [...stab.entries()].map(([area, { ca, ce }]) => ({
      area,
      ca,
      ce,
      i: +(ce / (ca + ce)).toFixed(2),
    })),
    sccs,
    fanIn: top(fanIn),
    fanOut: top(fanOut),
  };
}
