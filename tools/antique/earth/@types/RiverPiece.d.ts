/** One Natural Earth river line (a LineString, or one part of a MultiLineString),
 * lon/lat degrees, with the attributes the bake styles it by. */
export type RiverPiece = {
  /** Pieces sharing a key belong to one river (layer + `rivernum`, else name). */
  readonly key: string;
  readonly scalerank: number;
  readonly minZoom: number;
  readonly points: readonly (readonly [number, number])[];
};
