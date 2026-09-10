/**
 * The fields of a skråfoto STAC item this pipeline reads (`data/raw/skraafoto/README.md`).
 * Units: `pers:omega/phi/kappa` degrees; `pers:perspective_center` metres, EPSG:25832
 * easting/northing + DVR90 height; `pers:interior_orientation` millimetres; `datetime`
 * ISO 8601. `proj:shape` is STAC's `[rows, cols]` — height first.
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
    /** Which way the Maltese-cross rig looked — the API's own label for the frame. */
    readonly direction: 'nadir' | 'north' | 'east' | 'south' | 'west';
    readonly datetime: string;
  };
  readonly assets: { readonly data: { readonly href: string } };
};
