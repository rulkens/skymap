/**
 * underfillImagerySource — wrap a regional PRIMARY source so its transparent
 * margins fall back to a coarser FILLER source, guaranteeing every baked tile
 * is fully opaque (see `buildSurfaceTiles.ts`'s "bake invariant" note: "no
 * coverage" must show up as an absent file, never a transparent texel, or a
 * regional tile shadows the ancestor beneath it in the runtime page table).
 * Identity fields are `primary`'s verbatim; only `readBox` blends.
 */

import sharp from 'sharp';

import type { SurfaceImagerySource } from './SurfaceImagerySource';

export function underfillImagerySource(
  primary: SurfaceImagerySource,
  filler: SurfaceImagerySource,
): SurfaceImagerySource {
  return {
    id: primary.id,
    attribution: primary.attribution,
    maxLevel: primary.maxLevel,
    coverage: primary.coverage,
    provenance: primary.provenance,

    async readBox(box, widthPx, heightPx) {
      const primaryRaster = await primary.readBox(box, widthPx, heightPx);
      if (primaryRaster === null) {
        // Outside the band's own boxes this is one of R11's HALO tiles —
        // baked only so the tile beside it has all three siblings, and its
        // pixels can come from nowhere but the filler. INSIDE them a decline
        // still means "no file at all": filling a hole in the harvest with
        // upscaled filler would hide it behind plausible pixels.
        // Strict, not `boundsOverlap`'s inclusive-edge test: coverage boxes and
        // their halo neighbours sit on the same tile grid and routinely share
        // an exact boundary (GeoDanmark's bbox is snapped to it — see
        // docs/DATA.md) with zero real overlap, which must still read as halo.
        const halo = !primary.coverage.some(
          (c) =>
            box.west < c.east && box.east > c.west && box.south < c.north && box.north > c.south,
        );
        return halo ? filler.readBox(box, widthPx, heightPx) : null;
      }

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
