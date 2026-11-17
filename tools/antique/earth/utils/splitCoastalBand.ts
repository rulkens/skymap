/**
 * splitCoastalBand — the part of `subject` within `km` of the sea, and the
 * interior beyond it: land shrunk by `km` (a geodesic negative buffer,
 * mapshaper -buffer) is the interior. The land is first cut to a box
 * reaching 2 × km past the subject: the box edge reads as coast to the buffer,
 * and that far out its false coast cannot reach the subject.
 */

import mapshaper from 'mapshaper';

import type { LonLatPolygons } from '../@types/LonLatPolygons';
import { cellsToGeoJson } from './cellsToGeoJson';
import { geoJsonToCells } from './geoJsonToCells';

const KM_PER_DEG = 111.32;

export async function splitCoastalBand(
  subject: LonLatPolygons,
  land: LonLatPolygons,
  km: number,
): Promise<{ band: LonLatPolygons; interior: LonLatPolygons }> {
  const points = subject.flat(2);
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const padLat = (2 * km) / KM_PER_DEG;
  const coldest = Math.min(80, Math.max(Math.abs(south), Math.abs(north)) + padLat);
  const padLon = padLat / Math.cos((coldest * Math.PI) / 180);
  const box = [
    Math.max(-180, Math.min(...lons) - padLon),
    Math.max(-90, south - padLat),
    Math.min(180, Math.max(...lons) + padLon),
    Math.min(90, north + padLat),
  ].join(',');
  const out = await mapshaper.applyCommands(
    '-i combine-files subject.json land.json ' +
      `-clip bbox=${box} target=land -buffer radius=-${km}km target=land name=interior ` +
      '-clip interior target=subject + name=inner -erase interior target=subject name=band ' +
      '-o target=band band.json -o target=inner inner.json',
    {
      'subject.json': cellsToGeoJson([{ key: 's', polygons: subject }]),
      'land.json': cellsToGeoJson([{ key: 'l', polygons: land }]),
    },
  );
  const polygonsOf = (name: string) => geoJsonToCells(String(out[name])).flatMap((cell) => cell.polygons);
  return { band: polygonsOf('band.json'), interior: polygonsOf('inner.json') };
}
