/**
 * Stages a known-pose COLMAP **text** model: one PINHOLE camera per photo, the
 * poses as camera←world rigid transforms, and the LiDAR cloud as points3D.
 * Header-free — COLMAP's readers skip `#` lines but never require them, and
 * Brush inherits that reader. `observations` projects the cloud into every
 * camera, which is the whole sparse model for `bakeMesh` (spec §6.2).
 *
 * The frame flip is the landmine: `PhotoPose.rotation` is group←camera as
 * (x, y, z, w); COLMAP wants the inverse, scalar-first, with the translation
 * expressed in the camera frame (`t = -R·C`, not the camera centre `C`).
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parsePoints } from '../../scene-workbench/src/scene/parsePoints';
import { POINTS_RECORD_BYTES } from '../pack/pointCloudFormat';
import type { PhotoPose } from '../../scene-workbench/@types/PhotoPose';

export type ColmapModelSpec = {
  readonly poses: readonly PhotoPose[];
  readonly pointsBinPath: string;
  readonly pointSampleTarget: number;
  readonly outDir: string;
  /** Project the sampled points into every camera and write POINTS2D + TRACKs. */
  readonly observations?: boolean;
};

type SampledPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

/** One point seen in one image, at that image's POINTS2D index. */
type Observation = { readonly u: number; readonly v: number; readonly point: number };

/** COLMAP wants a reprojection error per point; nothing downstream weights by
 *  it, so the LiDAR's own accuracy in pixels is as true a constant as any. */
const POINT_ERROR_PX = '0.5';

export async function writeColmapModel(spec: ColmapModelSpec): Promise<void> {
  const imagesDir = join(spec.outDir, 'images');
  await mkdir(imagesDir, { recursive: true });

  const points = await samplePoints(spec);
  const tracks: string[][] = points.map(() => []);
  const seen: Observation[][] = spec.poses.map(() => []);

  const cameras: string[] = [];
  const headers: string[] = [];
  // One rule for the NAME column and the copy destination: images.txt names a
  // file the reconstruction then opens, so the two can never be spelled apart.
  const names = spec.poses.map((pose) => `${pose.id}.jpg`);

  spec.poses.forEach((pose, i) => {
    const id = i + 1;
    const [cx, cy] = pose.principalPointPx;
    cameras.push(
      `${id} PINHOLE ${pose.imageWidthPx} ${pose.imageHeightPx} ` +
        `${pose.focalLengthPx} ${pose.focalLengthPx} ${cx} ${cy}`,
    );

    const [qx, qy, qz, qw] = pose.rotation;
    // Conjugate of the unit quaternion (w, v) is (w, -v) — the camera←world
    // rotation, which is what the columns below, `t` and the projection need.
    const [w, x, y, z] = [qw, -qx, -qy, -qz];
    const rows = [
      [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
    const [px, py, pz] = pose.positionM;
    const t = rows.map((row) => -(row[0]! * px + row[1]! * py + row[2]! * pz));

    headers.push(`${id} ${w} ${x} ${y} ${z} ${t[0]} ${t[1]} ${t[2]} ${id} ${names[i]}`);
    if (!spec.observations) return;

    points.forEach((point, j) => {
      const cam = rows.map(
        (row, k) => row[0]! * point.x + row[1]! * point.y + row[2]! * point.z + t[k]!,
      );
      if (cam[2]! <= 0) return;
      const u = (pose.focalLengthPx * cam[0]!) / cam[2]! + cx;
      const v = (pose.focalLengthPx * cam[1]!) / cam[2]! + cy;
      if (u < 0 || u >= pose.imageWidthPx || v < 0 || v >= pose.imageHeightPx) return;
      tracks[j]!.push(`${id} ${seen[i]!.length}`);
      seen[i]!.push({ u, v, point: j });
    });
  });

  // A point one camera saw is no track at all, so it leaves points3D.txt — but
  // its POINTS2D entries stay in place, as COLMAP's "no 3D point" id. Dropping
  // them instead would renumber every later observation in that image.
  const kept = tracks.map((track) => !spec.observations || track.length >= 2);

  const images = headers.flatMap((header, i) => [
    header,
    seen[i]!.map(
      (o) => `${o.u.toFixed(2)} ${o.v.toFixed(2)} ${kept[o.point] ? o.point + 1 : -1}`,
    ).join(' '),
  ]);
  const points3D = points.flatMap((point, j) =>
    kept[j]
      ? `${j + 1} ${point.x} ${point.y} ${point.z} ${point.r} ${point.g} ${point.b} ` +
        (spec.observations ? `${POINT_ERROR_PX} ${tracks[j]!.join(' ')}` : '0')
      : [],
  );

  await writeFile(join(spec.outDir, 'cameras.txt'), `${cameras.join('\n')}\n`);
  await writeFile(join(spec.outDir, 'images.txt'), `${images.join('\n')}\n`);
  await writeFile(join(spec.outDir, 'points3D.txt'), `${points3D.join('\n')}\n`);

  await Promise.all(
    spec.poses.map((pose, i) => copyFile(pose.imageUrl, join(imagesDir, names[i]!))),
  );
}

async function samplePoints(spec: ColmapModelSpec): Promise<readonly SampledPoint[]> {
  const file = await readFile(spec.pointsBinPath);
  // Node pools small Buffers, so the underlying ArrayBuffer holds unrelated
  // bytes; parsePoints validates against the whole buffer length and would
  // reject it. Slice out this file's own bytes first.
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { pointCount, records } = parsePoints(bytes as ArrayBuffer);
  const dv = new DataView(records.buffer, records.byteOffset, records.byteLength);

  const stride = Math.max(1, Math.floor(pointCount / spec.pointSampleTarget));
  const points: SampledPoint[] = [];
  for (let i = 0; i < pointCount; i += stride) {
    const o = i * POINTS_RECORD_BYTES;
    points.push({
      x: dv.getFloat32(o + 0, true),
      y: dv.getFloat32(o + 4, true),
      z: dv.getFloat32(o + 8, true),
      r: dv.getUint8(o + 12),
      g: dv.getUint8(o + 13),
      b: dv.getUint8(o + 14),
    });
  }
  return points;
}
