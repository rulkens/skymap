/**
 * The lowest z in a `points.bin` cloud, metres in the group's ENU frame — the
 * terrain floor `bakeSplats` prunes sub-surface splats against. Min, not a
 * percentile: the DHM product is classified and blunder-free, and erring low
 * only spares splats.
 */
import { readFile } from 'node:fs/promises';

import { parsePoints } from '../../scene-workbench/src/scene/parsePoints';
import { POINTS_RECORD_BYTES } from '../pack/pointCloudFormat';

export async function lidarFloorZM(pointsBinPath: string): Promise<number> {
  const file = await readFile(pointsBinPath);
  // Node pools small Buffers; parsePoints validates against the whole
  // ArrayBuffer, so hand it this file's own bytes (writeColmapModel's trap).
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { pointCount, records } = parsePoints(bytes as ArrayBuffer);
  const dv = new DataView(records.buffer, records.byteOffset, records.byteLength);

  let floorZM = Infinity;
  for (let i = 0; i < pointCount; i++) {
    floorZM = Math.min(floorZM, dv.getFloat32(i * POINTS_RECORD_BYTES + 8, true));
  }
  if (!Number.isFinite(floorZM)) {
    throw new Error(`lidarFloorZM: ${pointsBinPath} holds no points`);
  }
  return floorZM;
}
