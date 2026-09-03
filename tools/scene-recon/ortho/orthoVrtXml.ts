/**
 * orthoVrtXml — PDAL's `filters.colorization` needs a GDAL-readable raster
 * in the points' SRS, but the GeoDanmark harvest is bare `<x>/<y>.jpg` on
 * skymap's equirect grid with no georeferencing of its own. A VRT gives the
 * tile rect one geotransform and points `<SimpleSource>`s at the JPEGs in
 * place, so the bake never re-encodes pixels or litters the raw-data tree
 * with world-file sidecars.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { earthTileColumns } from '../../../src/utils/scene/earthTileColumns';
import type { TileIndexRect } from '../../utils/scene/TileIndexRect';

export type OrthoVrtSpec = {
  /** `<geodanmark.dir>/19` — the level directory holding `<x>/<y>.jpg`. */
  readonly levelDir: string;
  readonly rect: TileIndexRect; // earthTileIndicesForBounds(bounds, 19, EARTH_TILE_PX)
  readonly level: number;
  readonly tilePx: number;
};

const BAND_COLOR_INTERP = ['Red', 'Green', 'Blue'] as const;

/** A GDAL VRT (EPSG:4326, plate carrée) mosaicking the rect's tiles, three bands. */
export function orthoVrtXml(spec: OrthoVrtSpec): string {
  const { levelDir, rect, level, tilePx } = spec;
  const { xMin, xMax, yMin, yMax } = rect;

  const deg = 360 / earthTileColumns(level, tilePx);
  const pixelSize = deg / tilePx;
  const originX = xMin * deg - 180;
  const originY = 90 - yMin * deg;
  const rasterWidth = (xMax - xMin + 1) * tilePx;
  const rasterHeight = (yMax - yMin + 1) * tilePx;

  const tiles: { x: number; y: number; path: string }[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const path = join(levelDir, String(x), `${y}.jpg`);
      if (existsSync(path)) tiles.push({ x, y, path });
    }
  }

  const bandsXml = BAND_COLOR_INTERP.map((colorInterp, i) => {
    const band = i + 1;
    const sourcesXml = tiles
      .map(
        (tile) => `
      <SimpleSource>
        <SourceFilename relativeToVRT="0">${tile.path}</SourceFilename>
        <SourceBand>${band}</SourceBand>
        <SrcRect xOff="0" yOff="0" xSize="${tilePx}" ySize="${tilePx}"/>
        <DstRect xOff="${(tile.x - xMin) * tilePx}" yOff="${(tile.y - yMin) * tilePx}" xSize="${tilePx}" ySize="${tilePx}"/>
      </SimpleSource>`,
      )
      .join('');
    return `
  <VRTRasterBand dataType="Byte" band="${band}">
    <ColorInterp>${colorInterp}</ColorInterp>${sourcesXml}
  </VRTRasterBand>`;
  }).join('');

  return `<VRTDataset rasterXSize="${rasterWidth}" rasterYSize="${rasterHeight}">
  <SRS>EPSG:4326</SRS>
  <GeoTransform>${originX}, ${pixelSize}, 0, ${originY}, 0, ${-pixelSize}</GeoTransform>${bandsXml}
</VRTDataset>
`;
}
