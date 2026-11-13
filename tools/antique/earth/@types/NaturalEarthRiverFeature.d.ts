/** The fields of a Natural Earth river GeoJSON feature the bake reads
 * (`data/raw/naturalearth/README.md`). */
export type NaturalEarthRiverFeature = {
  readonly properties: {
    readonly featurecla?: string | null;
    readonly name?: string | null;
    readonly ne_id?: number | null;
    readonly rivernum?: number | null;
    readonly scalerank: number;
    readonly min_zoom: number;
  };
  readonly geometry:
    | { readonly type: 'LineString'; readonly coordinates: readonly (readonly [number, number])[] }
    | {
        readonly type: 'MultiLineString';
        readonly coordinates: readonly (readonly (readonly [number, number])[])[];
      }
    | null;
};
