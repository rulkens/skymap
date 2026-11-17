/**
 * readNaturalEarthRivers — one Natural Earth river GeoJSON layer as the pieces
 * a 1690 map keeps (`isPre1690River`), every MultiLineString part its own
 * piece. Pieces are keyed per layer: the world and European layers number
 * their rivers independently.
 */

import { readFileSync } from 'node:fs';

import type { NaturalEarthRiverFeature } from '../@types/NaturalEarthRiverFeature';
import type { RiverPiece } from '../@types/RiverPiece';
import { isPre1690River } from './isPre1690River';

export function readNaturalEarthRivers(
  path: string,
  layer: string,
  onDropped?: (name: string) => void,
): RiverPiece[] {
  const { features } = JSON.parse(readFileSync(path, 'utf8')) as {
    features: readonly NaturalEarthRiverFeature[];
  };
  const pieces: RiverPiece[] = [];
  for (const { properties, geometry } of features) {
    if (!isPre1690River(properties)) {
      onDropped?.(properties.name ?? '');
      continue;
    }
    if (!geometry) continue;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    for (const line of lines)
      if (line.length >= 2)
        pieces.push({
          key: `${layer}:${properties.rivernum || properties.name || ''}`,
          scalerank: properties.scalerank,
          minZoom: properties.min_zoom,
          points: line,
        });
  }
  return pieces;
}
