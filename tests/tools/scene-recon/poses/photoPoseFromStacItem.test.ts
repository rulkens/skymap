/**
 * photoPoseFromStacItem — the ω/φ/κ matrix, the grid-convergence correction
 * and the principal-point sign are only ever wrong in ways a real frame shows,
 * so the one test that matters projects the group anchor through the returned
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

const FIXTURE = fileURLToPath(
  new URL('../../../fixtures/skraafoto/2025_84_40_1_0049_00002495_100mm.json', import.meta.url),
);
const ITEM = JSON.parse(readFileSync(FIXTURE, 'utf8')) as SkraafotoStacItem;

/** `pers:perspective_center` through `topocentricPositionsM`'s own cct pipeline. */
const POSITION_M: Vec3 = [-328.391922, 25.48876, 2181.851517];
const DOWNSAMPLE_SCALE = 1920 / 20544;

/** Read by hand off the fetched JPEG (see the module header), ±3 px. */
const HAND_READ_PIXEL = { u: 665, v: 644 };

/** v rotated by the conjugate of q — group frame → camera frame. */
function rotateByConjugate(q: Vec4, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [cx, cy, cz] = [-qx, -qy, -qz];
  const tx = 2 * (cy * v[2] - cz * v[1]);
  const ty = 2 * (cz * v[0] - cx * v[2]);
  const tz = 2 * (cx * v[1] - cy * v[0]);
  return [
    v[0] + qw * tx + (cy * tz - cz * ty),
    v[1] + qw * ty + (cz * tx - cx * tz),
    v[2] + qw * tz + (cx * ty - cy * tx),
  ];
}

describe('photoPoseFromStacItem', () => {
  it('projects the group anchor to the hand-read pixel', () => {
    const pose = photoPoseFromStacItem(ITEM, SOENDERMARKEN.anchor, POSITION_M, DOWNSAMPLE_SCALE);

    const toCamera: Vec3 = [-pose.positionM[0], -pose.positionM[1], -pose.positionM[2]];
    const [x, y, z] = rotateByConjugate(pose.rotation, toCamera);
    expect(z, 'anchor must be in front of the camera').toBeGreaterThan(0);

    const u = pose.principalPointPx[0] + (pose.focalLengthPx * x) / z;
    const v = pose.principalPointPx[1] + (pose.focalLengthPx * y) / z;

    expect(Math.hypot(u - HAND_READ_PIXEL.u, v - HAND_READ_PIXEL.v)).toBeLessThan(15);
  });
});
