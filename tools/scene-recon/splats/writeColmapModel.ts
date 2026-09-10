/**
 * Stages a known-pose COLMAP **text** model for Brush: one PINHOLE camera per
 * photo, the poses as world←camera rigid transforms, and the LiDAR cloud as
 * the initial points3D. Header-free — COLMAP's readers skip `#` lines but
 * never require them, and Brush inherits that reader.
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
};

export async function writeColmapModel(spec: ColmapModelSpec): Promise<void> {
  const imagesDir = join(spec.outDir, 'images');
  await mkdir(imagesDir, { recursive: true });

  const cameras: string[] = [];
  const images: string[] = [];

  spec.poses.forEach((pose, i) => {
    const id = i + 1;
    const name = `${pose.id}.jpg`;
    const [cx, cy] = pose.principalPointPx;
    cameras.push(
      `${id} PINHOLE ${pose.imageWidthPx} ${pose.imageHeightPx} ` +
        `${pose.focalLengthPx} ${pose.focalLengthPx} ${cx} ${cy}`,
    );

    const [qx, qy, qz, qw] = pose.rotation;
    // Conjugate of the unit quaternion (w, v) is (w, -v) — the world←camera
    // rotation, which is what both the columns below and `t` need.
    const [w, x, y, z] = [qw, -qx, -qy, -qz];
    const [px, py, pz] = pose.positionM;
    const t = [
      -((1 - 2 * (y * y + z * z)) * px + 2 * (x * y - w * z) * py + 2 * (x * z + w * y) * pz),
      -(2 * (x * y + w * z) * px + (1 - 2 * (x * x + z * z)) * py + 2 * (y * z - w * x) * pz),
      -(2 * (x * z - w * y) * px + 2 * (y * z + w * x) * py + (1 - 2 * (x * x + y * y)) * pz),
    ];

    images.push(
      `${id} ${w} ${x} ${y} ${z} ${t[0]} ${t[1]} ${t[2]} ${id} ${name}`,
      // POINTS2D, deliberately empty: Brush's loader needs no observations.
      '',
    );
  });

  await writeFile(join(spec.outDir, 'cameras.txt'), `${cameras.join('\n')}\n`);
  await writeFile(join(spec.outDir, 'images.txt'), `${images.join('\n')}\n`);
  await writeFile(join(spec.outDir, 'points3D.txt'), await points3DText(spec));

  await Promise.all(
    spec.poses.map((pose) => copyFile(pose.imageUrl, join(imagesDir, `${pose.id}.jpg`))),
  );
}

async function points3DText(spec: ColmapModelSpec): Promise<string> {
  const file = await readFile(spec.pointsBinPath);
  // Node pools small Buffers, so the underlying ArrayBuffer holds unrelated
  // bytes; parsePoints validates against the whole buffer length and would
  // reject it. Slice out this file's own bytes first.
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const { pointCount, records } = parsePoints(bytes as ArrayBuffer);
  const dv = new DataView(records.buffer, records.byteOffset, records.byteLength);

  const stride = Math.max(1, Math.floor(pointCount / spec.pointSampleTarget));
  const lines: string[] = [];
  for (let i = 0; i < pointCount; i += stride) {
    const o = i * POINTS_RECORD_BYTES;
    lines.push(
      `${lines.length + 1} ` +
        `${dv.getFloat32(o + 0, true)} ${dv.getFloat32(o + 4, true)} ${dv.getFloat32(o + 8, true)} ` +
        `${dv.getUint8(o + 12)} ${dv.getUint8(o + 13)} ${dv.getUint8(o + 14)} 0`,
    );
  }
  return `${lines.join('\n')}\n`;
}
