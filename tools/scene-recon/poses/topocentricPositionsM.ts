/**
 * topocentricPositionsM — camera centres from EPSG:25832 + DVR90 into the group's
 * ENU metre frame, sharing the `+proj=topocentric` tail the LiDAR bake reprojects
 * points with (`lidar/lidarPipelineStages.ts`), so both land in one frame.
 *
 * No leading `+proj=unitconvert`: PROJ's inverse UTM already emits radians,
 * unlike that pipeline's degree input. DVR90 heights go into `cart` as if
 * ellipsoidal — the same ~36 m geoid bias the LiDAR bake carries, shared
 * rather than differential, so it cancels between the two.
 */
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Runs one `cct <pipeline>` over stdin, returning its stdout lines. */
export type CctRunner = (
  pipeline: string,
  inputLines: readonly string[],
) => Promise<readonly string[]>;

/** `pointsUtm` are `[E, N, H]` triples; the whole batch rides one `cct` process. */
export async function topocentricPositionsM(
  anchor: GroupAnchor,
  pointsUtm: readonly Vec3[],
  deps: { readonly runCct: CctRunner },
): Promise<Vec3[]> {
  if (pointsUtm.length === 0) return [];

  const pipeline =
    '+proj=pipeline +step +inv +proj=utm +zone=32 +ellps=GRS80 ' +
    '+step +proj=cart +ellps=GRS80 ' +
    `+step +proj=topocentric +lat_0=${anchor.latDeg} +lon_0=${anchor.lonDeg} ` +
    `+h_0=${anchor.heightMDvr90} +ellps=GRS80`;

  const inputLines = pointsUtm.map(([e, n, h]) => `${e} ${n} ${h}`);
  const outputLines = await deps.runCct(pipeline, inputLines);

  if (outputLines.length !== pointsUtm.length) {
    throw new Error(
      `topocentricPositionsM: cct returned ${outputLines.length} line(s) for ` +
        `${pointsUtm.length} point(s)`,
    );
  }

  return outputLines.map((line, index) => {
    // cct appends a fourth column (the time coordinate, "inf" here) — drop it.
    const [x, y, z] = line.trim().split(/\s+/, 3).map(Number);
    if (x === undefined || y === undefined || z === undefined || !Number.isFinite(x + y + z)) {
      throw new Error(`topocentricPositionsM: cct line ${index} is not three numbers: "${line}"`);
    }
    return [x, y, z];
  });
}
