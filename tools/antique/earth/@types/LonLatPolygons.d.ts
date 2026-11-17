/** Polygons in lon/lat degrees, GeoJSON MultiPolygon order: each polygon is its
 * outer ring, then its holes; rings are closed (last point = first). */
export type LonLatPolygons = readonly (readonly (readonly (readonly [number, number])[])[])[];
