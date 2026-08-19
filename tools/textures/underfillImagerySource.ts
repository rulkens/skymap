/**
 * underfillImagerySource — wrap a regional PRIMARY source so its transparent
 * margins fall back to a coarser FILLER source, guaranteeing every baked tile
 * is fully opaque (see `buildEarthTiles.ts`'s "bake invariant" note: "no
 * coverage" must show up as an absent file, never a transparent texel, or a
 * regional tile shadows the ancestor beneath it in the runtime page table).
 * Identity fields are `primary`'s verbatim; only `readBox` blends.
 */

import sharp from 'sharp';

import type { EarthImagerySource } from './EarthImagerySource';

export function underfillImagerySource(
  primary: EarthImagerySource,
  filler: EarthImagerySource,
): EarthImagerySource {
  return {
    id: primary.id,
    attribution: primary.attribution,
    maxLevel: primary.maxLevel,
    coverage: primary.coverage,
    provenance: primary.provenance,

    async readBox(box, widthPx, heightPx) {
      // A primary decline means nothing here for the box at all — return null
      // WITHOUT reading filler. `bakeDeepestLevel` probes every z13 box on the
      // globe (~33.5M), and this decline path must stay existsSync-cheap.
      const primaryRaster = await primary.readBox(box, widthPx, heightPx);
      if (primaryRaster === null) return null;

      const fillerRaster = await filler.readBox(box, widthPx, heightPx);
      // Filler declining is strictly no worse than today: emit primary as-is.
      if (fillerRaster === null) return primaryRaster;

      const raw = { width: widthPx, height: heightPx, channels: 4 as const };
      const composited = await sharp(Buffer.from(fillerRaster), { raw })
        .composite([{ input: Buffer.from(primaryRaster), raw }])
        .raw()
        .toBuffer();

      return new Uint8Array(composited);
    },
  };
}
