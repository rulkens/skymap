/**
 * render.ts — POST /api/render: one raw RGBA raster of a box, either
 * straight off the primary imagery (`original`) or through the recipe's
 * pixel pipeline (`adjusted`), with an optional lighting-preview relight
 * multiplied in afterwards. A `sunFit` slider must relight `adjusted` live,
 * not only after Save, so `deps.getField` is keyed on the recipe's `sunFit`.
 * Wide boxes fit at `previewSunFit`'s coarser stride (see `field.ts`), so
 * the two routes' calls land on the same cached fit.
 */
import type { AlbedoRecipe } from '../../../textures/AlbedoRecipe.ts';
import type { HeightSource } from '../../../textures/HeightSource.ts';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds.ts';
import type { SlopeLattice } from '../../../textures/SlopeLattice.ts';
import type { SunField } from '../../../textures/SunField.ts';
import type { SurfaceImagerySource } from '../../../textures/SurfaceImagerySource.ts';
import { albedoRecipeImagerySource } from '../../../textures/albedoRecipeImagerySource.ts';
import { readSlopeLattice } from '../../../textures/readSlopeLattice.ts';
import { clamp } from '../../../utils/textures/clamp.ts';
import { constantSunField } from '../../../utils/textures/constantSunField.ts';
import { sampleSlope } from '../../../utils/textures/sampleSlope.ts';
import { srgbToLinear } from '../../../utils/color/srgbToLinear.ts';
import { linearToSrgb } from '../../../utils/color/linearToSrgb.ts';
import { orenNayarPreview } from '../orenNayarPreview.ts';
import { previewSunFit } from '../previewSunFit.ts';

export type RenderLight = {
  readonly azDeg: number;
  readonly elDeg: number;
  readonly roughness: number;
  readonly ambient: number;
};

export type RenderBody = {
  readonly box: LonLatBounds;
  readonly px: number;
  readonly recipe: AlbedoRecipe;
  readonly variant: 'original' | 'adjusted';
  readonly light?: RenderLight;
  readonly manualG?: readonly [number, number];
};

export type RenderDeps = {
  readonly imagery: SurfaceImagerySource;
  readonly height: HeightSource;
  readonly radiusM: number;
  readonly getField: (region: LonLatBounds, sunFit: AlbedoRecipe['sunFit']) => Promise<SunField>;
};

function relight(
  rgba: Uint8Array,
  box: LonLatBounds,
  widthPx: number,
  heightPx: number,
  lattice: SlopeLattice,
  light: RenderLight,
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let py = 0; py < heightPx; py++) {
    const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
    for (let px = 0; px < widthPx; px++) {
      const i = (py * widthPx + px) * 4;
      out[i + 3] = rgba[i + 3]!;
      if (rgba[i + 3] === 0) {
        out[i] = rgba[i]!;
        out[i + 1] = rgba[i + 1]!;
        out[i + 2] = rgba[i + 2]!;
        continue;
      }
      const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
      const [sx, sy] = sampleSlope(lattice, lon, lat);
      const factor = orenNayarPreview(sx, sy, light);
      out[i] = clamp(Math.round(linearToSrgb(srgbToLinear(rgba[i]! / 255) * factor) * 255), 0, 255);
      out[i + 1] = clamp(
        Math.round(linearToSrgb(srgbToLinear(rgba[i + 1]! / 255) * factor) * 255),
        0,
        255,
      );
      out[i + 2] = clamp(
        Math.round(linearToSrgb(srgbToLinear(rgba[i + 2]! / 255) * factor) * 255),
        0,
        255,
      );
    }
  }
  return out;
}

export async function handleRender(opts: {
  readonly body: RenderBody;
  readonly deps: RenderDeps;
}): Promise<Uint8Array> {
  const { box, px, recipe, variant, light, manualG } = opts.body;
  const { imagery, height, radiusM, getField } = opts.deps;

  let raster: Uint8Array | null;
  if (variant === 'original') {
    raster = await imagery.readBox(box, px, px);
  } else {
    const { sunFit, ...pixelApply } = recipe;
    const field =
      manualG !== undefined
        ? constantSunField(box, manualG, radiusM)
        : await getField(box, previewSunFit({ sunFit, box, radiusM }).sunFit);
    raster = await albedoRecipeImagerySource(imagery, height, field, pixelApply).readBox(
      box,
      px,
      px,
    );
  }
  if (raster === null) {
    throw new Error(`handleRender: box ${JSON.stringify(box)} has no coverage`);
  }
  if (light === undefined) return raster;

  const lattice = await readSlopeLattice(height, box, radiusM);
  return relight(raster, box, px, px, lattice, light);
}
