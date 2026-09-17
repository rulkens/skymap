/**
 * field.ts — POST /api/field: the fitted sun field over a box, as arrows at
 * field cell centres, for the UI's overlay. Goes through the same
 * `deps.getField` cache the render route uses, so switching back to a box
 * already fit doesn't refit.
 */
import type { AlbedoRecipe } from '../../../textures/AlbedoRecipe.ts';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds.ts';
import type { SunField } from '../../../textures/SunField.ts';

export type FieldBody = {
  readonly box: LonLatBounds;
  readonly sunFit: AlbedoRecipe['sunFit'];
};

export type FieldArrow = {
  readonly lon: number;
  readonly lat: number;
  readonly gx: number;
  readonly gy: number;
  readonly confidence: number;
};

export type FieldResult = { readonly arrows: readonly FieldArrow[] };

export async function handleField(opts: {
  readonly body: FieldBody;
  readonly deps: {
    readonly getField: (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField>;
  };
}): Promise<FieldResult> {
  const { box, sunFit } = opts.body;
  const field = await opts.deps.getField(box, sunFit);
  const arrows: FieldArrow[] = [];
  for (let j = 0; j < field.height; j++) {
    const lat =
      field.bounds.north - ((j + 0.5) / field.height) * (field.bounds.north - field.bounds.south);
    for (let i = 0; i < field.width; i++) {
      const lon =
        field.bounds.west + ((i + 0.5) / field.width) * (field.bounds.east - field.bounds.west);
      const idx = j * field.width + i;
      arrows.push({
        lon,
        lat,
        gx: field.gx[idx]!,
        gy: field.gy[idx]!,
        confidence: field.confidence[idx]!,
      });
    }
  }
  return { arrows };
}
