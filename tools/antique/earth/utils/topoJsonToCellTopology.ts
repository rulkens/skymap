/** topoJsonToCellTopology — mapshaper's unquantized TopoJSON as a `CellTopology`, every geometry as polygons. */

import type { CellTopology } from '../@types/CellTopology';

export function topoJsonToCellTopology(text: string): CellTopology {
  const topo = JSON.parse(text) as {
    arcs: [number, number][][];
    transform?: unknown;
    objects: Record<
      string,
      { geometries: { type: string | null; arcs?: unknown; properties: { key: string } }[] }
    >;
  };
  if (topo.transform) throw new Error('topoJsonToCellTopology: quantized TopoJSON (export with no-quantization)');
  const [object] = Object.values(topo.objects);
  const cells = (object?.geometries ?? []).flatMap((g) => {
    const key = String(g.properties.key);
    if (g.type === 'Polygon') return [{ key, polygons: [g.arcs as number[][]] }];
    if (g.type === 'MultiPolygon') return [{ key, polygons: g.arcs as number[][][] }];
    return [];
  });
  return { arcs: topo.arcs, cells };
}
