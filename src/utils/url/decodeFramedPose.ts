/**
 * decodeFramedPose — the inverse of `encodeFramedPose`. The `#pose=` value is
 * external input (hand-edited, truncated, or from a session that added a scene
 * body since), so every failure — a wrong tag, a wrong field count, a
 * non-finite number, or an id outside `SCENE_BODIES` / `SURFACE_FIXED_SITES` —
 * returns null rather than throwing or guessing.
 */

import type { FramedCameraPose } from '../../@types/camera/FramedCameraPose';
import type { BodyId } from '../../@types/data/body/BodyId';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';
import { MIN_DISTANCE_MPC } from '../camera/clampDistance';

// `BodyId` (the `settings.bodies.items` category domain) is narrower than a
// scene body's OWN id (`'mars'`, `'curiosity'`, …); every rung that stores an
// individual body's id in that field already crosses this gap with a cast
// (`sitePoseToBodyArm.ts`, `nearestBodyHR.ts`, …) — mirrored here rather than
// widening the field's type project-wide for one reader.
const isSceneBodyId = (id: string): boolean => SCENE_BODIES.some((b) => b.id === id);
const isSurfaceSiteId = (id: string): boolean => SURFACE_FIXED_SITES.some((s) => s.id === id);

// `Number('')` is 0, not NaN — an empty field must fail rather than read as a
// degenerate-but-"valid" zero, so it is rejected before ever reaching `Number`.
function parseNumbers(fields: readonly string[]): readonly number[] | null {
  const out = fields.map((f) => (f === '' ? NaN : Number(f)));
  return out.every(Number.isFinite) ? out : null;
}

export function decodeFramedPose(value: string): FramedCameraPose | null {
  const fields = value.split(',');
  const tag = fields[0];

  if (tag === 'b') {
    if (fields.length !== 17) return null;
    const bodyId = fields[1]!;
    if (!isSceneBodyId(bodyId)) return null;
    const n = parseNumbers(fields.slice(2));
    if (n === null) return null;
    return {
      frame: { body: bodyId as BodyId },
      pose: {
        bodyId: bodyId as BodyId,
        anchorLocalM: [n[0]!, n[1]!, n[2]!],
        eyeRelAnchorM: [n[3]!, n[4]!, n[5]!],
        basisLocal: [n[6]!, n[7]!, n[8]!, n[9]!, n[10]!, n[11]!, n[12]!, n[13]!, n[14]!],
      },
    };
  }

  if (tag === 's') {
    if (fields.length !== 5) return null;
    const siteId = fields[1]!;
    if (!isSurfaceSiteId(siteId)) return null;
    const n = parseNumbers(fields.slice(2));
    if (n === null) return null;
    // `rangeM` is a real metre distance, not `clampDistance`'s Mpc floor.
    if (n[2]! <= 0) return null;
    return {
      frame: { site: siteId as BodyId },
      pose: { siteId: siteId as BodyId, headingRad: n[0]!, elevationRad: n[1]!, rangeM: n[2]! },
    };
  }

  if (tag === 'a') {
    if (fields.length !== 8) return null;
    const n = parseNumbers(fields.slice(1));
    if (n === null) return null;
    // `distance` is `CameraPose`'s Mpc field, so the same degeneracy floor
    // the live orbit camera is clamped to applies here.
    if (n[5]! < MIN_DISTANCE_MPC) return null;
    return {
      frame: 'absolute',
      pose: {
        target: [n[0]!, n[1]!, n[2]!],
        yaw: n[3]!,
        pitch: n[4]!,
        distance: n[5]!,
        roll: n[6]!,
      },
    };
  }

  return null;
}
