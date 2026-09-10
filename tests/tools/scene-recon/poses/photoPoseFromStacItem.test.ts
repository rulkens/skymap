/**
 * photoPoseFromStacItem — the ω/φ/κ matrix, the grid-convergence correction
 * and the principal-point sign are only ever wrong in ways a real frame shows,
 * so the anchor test projects the group anchor through the returned
 * pose and compares against a pixel read off the fetched JPEG by hand.
 *
 * Ground truth (independent of this formula): the 1920-long-edge JPEG of
 * fixture item 2025_84_40_1_0049_00002495_100mm was overlaid on the
 * georeferenced GeoDanmark 2025 orthophoto and the anchor's own ortho pixel
 * matched to the photo by eye — Søndermarken lawn, just north of the S-bend
 * footpath, ~24 m west of the three poplars. See the task report for the
 * overlay sweep that brackets it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { photoPoseFromStacItem } from '../../../../tools/scene-recon/poses/photoPoseFromStacItem';
import { SOENDERMARKEN } from '../../../../tools/scene-recon/groups/soendermarken';
import type { SkraafotoStacItem } from '../../../../tools/scene-recon/@types/SkraafotoStacItem';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../fixtures/skraafoto/${name}.json`, import.meta.url)),
      'utf8',
    ),
  ) as SkraafotoStacItem;

const ITEM = fixture('2025_84_40_1_0049_00002495_100mm');
const OBLIQUE_ITEM = fixture('2025_84_40_5_0052_00001969_100mm');

/** `pers:perspective_center` through `topocentricPositionsM`'s own cct pipeline. */
const POSITION_M: Vec3 = [-328.391922, 25.48876, 2181.851517];
const DOWNSAMPLE_SCALE = 1920 / 20544;

/** Read by hand off the fetched JPEG (see the module header), ±3 px. */
const HAND_READ_PIXEL = { u: 665, v: 644 };

/** v rotated by q — `PhotoPose.rotation` is group ← camera. */
function rotate(q: Vec4, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

const conjugate = ([x, y, z, w]: Vec4): Vec4 => [-x, -y, -z, w];

describe('photoPoseFromStacItem', () => {
  it('projects the group anchor to the hand-read pixel', () => {
    const pose = photoPoseFromStacItem(ITEM, SOENDERMARKEN.anchor, POSITION_M, DOWNSAMPLE_SCALE);

    const toCamera: Vec3 = [-pose.positionM[0], -pose.positionM[1], -pose.positionM[2]];
    const [x, y, z] = rotate(conjugate(pose.rotation), toCamera);
    expect(z, 'anchor must be in front of the camera').toBeGreaterThan(0);

    const u = pose.principalPointPx[0] + (pose.focalLengthPx * x) / z;
    const v = pose.principalPointPx[1] + (pose.focalLengthPx * y) / z;

    // 8 px = the 0.40 px residual this pose actually lands at + the ±3 px reading
    // uncertainty, doubled. Dropping the grid convergence lands at 15.0 px, so a
    // looser bound would stop discriminating the bug this test exists for.
    expect(Math.hypot(u - HAND_READ_PIXEL.u, v - HAND_READ_PIXEL.v)).toBeLessThan(8);
  });

  // Ground truth is the API's own `direction: "west"`, not the collinearity formula:
  // the nadir frame cannot separate the transposed matrix from the untransposed one
  // (1.8 px), but a 45° oblique swings ~90° of azimuth between them, silently ruining
  // the bake. Cross-check from the item's `pers:rotation_matrix`: −row3 = (−0.709,
  // 0.001, −0.705) in the grid, i.e. ENU (−0.708, 0.037, −0.705) once the +2.9151°
  // convergence is undone; transposing `m` back gives (−0.03, −0.709, −0.705) — south.
  it('points a west-looking oblique frame west', () => {
    // Nadir centre + its grid offset de-rotated; the axis assertion ignores it.
    const positionM: Vec3 = [2077.866, -103.811, 2183.842];
    const scale = 1920 / 14144;
    const pose = photoPoseFromStacItem(OBLIQUE_ITEM, SOENDERMARKEN.anchor, positionM, scale);

    const [east, north, up] = rotate(pose.rotation, [0, 0, 1]);

    expect(east, 'optical axis points west').toBeLessThan(-0.6);
    expect(Math.abs(north), 'optical axis is not north/south').toBeLessThan(0.15);
    expect(up, 'oblique looks down').toBeLessThan(0);
  });
});
