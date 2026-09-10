/**
 * The terrain floor of a `points.bin` cloud, metres in the group's ENU frame —
 * what `bakeSplats` prunes sub-surface splats against.
 *
 * A low quantile, NOT the minimum: the DHM tiles carry blunders (Søndermarken
 * spans −413 m to +844 m against real terrain of about −18 m to +25 m), and a
 * single one drags the floor below every splat worth pruning.
 */
import { readFile } from 'node:fs/promises';

import { parsePoints } from '../../scene-workbench/src/scene/parsePoints';
import { POINTS_RECORD_BYTES } from '../pack/pointCloudFormat';

/** 0.1%: past the blunders (34 points below −50 m in 1.6 M), still well under
 *  the lowest real ground. */
const FLOOR_QUANTILE = 0.001;

export async function lidarFloorZM(pointsBinPath: string): Promise<number> {
  const file = await readFile(pointsBinPath);
  // Node pools small Buffers; parsePoints validates against the whole
  // ArrayBuffer, so hand it this file's own bytes (writeColmapModel's trap).
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { pointCount, records } = parsePoints(bytes as ArrayBuffer);
  if (pointCount === 0) {
    throw new Error(`lidarFloorZM: ${pointsBinPath} holds no points`);
  }
  const dv = new DataView(records.buffer, records.byteOffset, records.byteLength);

  const heightsM = new Float32Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    heightsM[i] = dv.getFloat32(i * POINTS_RECORD_BYTES + 8, true);
  }
  heightsM.sort();
  return heightsM[Math.floor(FLOOR_QUANTILE * (pointCount - 1))]!;
}
