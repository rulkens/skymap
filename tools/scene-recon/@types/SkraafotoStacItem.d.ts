/**
 * SkraafotoStacItem — the fields of a Dataforsyningen skråfoto STAC item this
 * pipeline reads, not the whole STAC schema (the live item carries ~20 more).
 *
 * Units and frames, none of them recoverable from the field names:
 * `pers:omega/phi/kappa` degrees; `pers:perspective_center` metres in
 * EPSG:25832 easting/northing + DVR90 height; `pers:interior_orientation`
 * millimetres; `proj:shape` STAC's `[rows, cols]` — height first, width
 * second, the reverse of the `[width, height]` most raster APIs take.
 */
export type SkraafotoStacItem = {
  readonly id: string;
  readonly properties: {
    readonly 'pers:omega': number;
    readonly 'pers:phi': number;
    readonly 'pers:kappa': number;
    readonly 'pers:perspective_center': readonly [number, number, number];
    readonly 'pers:interior_orientation': {
      readonly focal_length: number;
      /** `[x, y]` — an array, not the scalar the plan's contract assumed. */
      readonly pixel_spacing: readonly [number, number];
      readonly principal_point_offset: readonly [number, number];
    };
    readonly 'proj:shape': readonly [number, number];
    /** ISO 8601 acquisition time. */
    readonly datetime: string;
  };
  readonly assets: { readonly data: { readonly href: string } };
};
