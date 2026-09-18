/**
 * field.ts — POST /api/field: the fitted sun field over a box, as arrows at
 * the field's own posts, for the UI's overlay. Goes through the same
 * `deps.getField` cache the render route uses, so switching back to a box
 * already fit doesn't refit. Wide boxes fit at a coarser `previewSunFit`
 * (never the recipe's own `sunFit` unchanged) — `render.ts`'s `adjusted`
 * must scale the same way so the two share the cached fit.
 */
import type { AlbedoRecipe } from '../../../textures/AlbedoRecipe.ts';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds.ts';
import type { SunField } from '../../../textures/SunField.ts';
import { previewSunFit } from '../previewSunFit.ts';

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

export type FieldResult = { readonly arrows: readonly FieldArrow[]; readonly coarsened: boolean };

export async function handleField(opts: {
  readonly body: FieldBody;
  readonly deps: {
    readonly getField: (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField>;
    readonly radiusM: number;
  };
}): Promise<FieldResult> {
  const { box, sunFit } = opts.body;
  const preview = previewSunFit({ sunFit, box, radiusM: opts.deps.radiusM });
  const field = await opts.deps.getField(box, preview.sunFit);
  const arrows: FieldArrow[] = [];
  for (let j = 0; j < field.height; j++) {
    const lat =
      field.height > 1
        ? field.bounds.north - (j / (field.height - 1)) * (field.bounds.north - field.bounds.south)
        : field.bounds.north;
    for (let i = 0; i < field.width; i++) {
      const lon =
        field.width > 1
          ? field.bounds.west + (i / (field.width - 1)) * (field.bounds.east - field.bounds.west)
          : field.bounds.west;
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
  return { arrows, coarsened: preview.coarsened };
}
