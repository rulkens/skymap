/** A coverage of cells as shared arcs (TopoJSON without quantization): each
 * cell's polygons are rings of arc indices, `~i` meaning arc i reversed, so two
 * cells meeting along a line both reference the one arc. */
export type CellTopology = {
  readonly arcs: readonly (readonly (readonly [number, number])[])[];
  readonly cells: readonly {
    readonly key: string;
    readonly polygons: readonly (readonly (readonly number[])[])[];
  }[];
};
