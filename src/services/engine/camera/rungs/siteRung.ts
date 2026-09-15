/**
 * The site rung's row (spec §4): a turntable about a fixed lat/lon on a host.
 * THE one place the site registries are read — the authored site row, the mesh
 * body's bounding sphere, the driver kind; everything below takes them as
 * arguments. `host` answers the site's PLANET, which is what keeps the
 * remembered tilt alive across a world → body → site descent (ruling 8).
 */

import type { BodyId } from '../../../../@types/data/body/BodyId';
import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { FrameOf } from '../../../../@types/camera/FrameOf';
import type { MeshBody } from '../../../../@types/scene/MeshBody';
import type { SurfaceFixedSite } from '../../../../@types/scene/SurfaceFixedSite';
import { SCENE_MESH_BODIES } from '../../../../data/bodies/sceneMeshBodies';
import { positionDriverById } from '../../../../data/bodies/positionDrivers';
import { bodyFixedEyeM } from '../../../../utils/camera/bodyFixedEyeM';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { focusInSubtree } from '../../../../utils/camera/focusInSubtree';
import { sitePointBodyFixed } from '../../../../utils/camera/sitePointBodyFixed';
import { sitePoseFromBodyArm } from '../../../../utils/camera/sitePoseFromBodyArm';
import { sitePoseToBodyArm } from '../../../../utils/camera/sitePoseToBodyArm';
import { steppedSitePose } from '../../../../utils/camera/steppedSitePose';
import { climbRowFor } from './climbRowFor';
import { hostOf } from './hostOf';
import { hostOrThrow } from './hostOrThrow';

/** The authored site row, or null when this body is not surface-fixed. */
function siteRowOf(id: BodyId): SurfaceFixedSite | null {
  const driver = positionDriverById(id);
  return driver.kind === 'surfaceFixed' ? driver : null;
}

/** A frame is only ever entered for a site `engage` resolved, so a miss is unreachable. */
function siteRowOrThrow(id: BodyId): SurfaceFixedSite {
  const site = siteRowOf(id);
  if (site === null) throw new Error(`siteRung: body '${id}' has no surfaceFixed driver`);
  return site;
}

/** The bounding sphere the band and the floors are rated in — the SCENE seed's, never the bake's. */
function meshBodyOf(id: BodyId): MeshBody {
  return findByIdOrThrow(SCENE_MESH_BODIES, id, 'siteRung');
}

export const siteRung: ClimbRow<'site'> = {
  kind: 'site',
  parent: 'body',
  emptyMemory: null,

  channels: {
    // World channels in, per prep's signature — so the leg's authored target is
    // the body row's business and this row only ever sees the folded arm.
    encode: (world, frame, ctx) => {
      const hostFrame: FrameOf['body'] = { body: hostOrThrow(frame, ctx).id };
      const arm = climbRowFor<'body'>(hostFrame).fromParent(
        { frame: 'absolute', pose: world },
        hostFrame,
        ctx,
      );
      const pose = siteRung.fromParent(arm, frame, ctx).pose;
      return {
        target: [0, 0, 0],
        yaw: pose.headingRad,
        pitch: pose.elevationRad,
        distance: pose.rangeM,
      };
    },
    // Authored channels are taken as authored: a leg's endpoints were clamped
    // when they were captured, and re-flooring here would bend a tween's ends.
    decode: (channels, frame) => ({
      frame,
      pose: {
        siteId: frame.site,
        headingRad: channels.yaw,
        elevationRad: channels.pitch,
        rangeM: channels.distance,
      },
    }),
  },

  host(frame, ctx) {
    const site = siteRowOf(frame.site);
    if (site === null) return null;
    return hostOf({ body: site.hostId as BodyId }, ctx);
  },

  step(memory, tilt, framed, input, ctx) {
    return {
      pose: steppedSitePose(
        framed.pose,
        input,
        meshBodyOf(framed.frame.site),
        ctx.viewportPx,
        ctx.fovYRad,
      ),
      memory,
      // Keyed by HOST, and this rung authors no tilt: the slot rides through.
      tilt,
    };
  },

  toParent(framed, ctx) {
    const host = hostOrThrow(framed.frame, ctx);
    return {
      frame: { body: host.id },
      pose: sitePoseToBodyArm(framed.pose, siteRowOrThrow(framed.frame.site), host.radiusM),
    };
  },

  fromParent(parent, frame, ctx) {
    const host = hostOrThrow(frame, ctx);
    return {
      frame,
      pose: sitePoseFromBodyArm(
        parent.pose,
        siteRowOrThrow(frame.site),
        host.radiusM,
        meshBodyOf(frame.site),
      ),
    };
  },

  engage(parent, ctx) {
    const focusId = ctx.focusBodyId;
    if (focusId === null) return null;
    const site = siteRowOf(focusId);
    // An orbit-driven mesh body has no `surfaceFixed` row and can therefore
    // never engage — the non-goal, enforced by the driver kind, not by a list.
    if (site === null || site.hostId !== parent.frame.body) return null;
    const host = hostOrThrow(parent.frame, ctx);
    const p = sitePointBodyFixed(site, host.radiusM);
    const eye = bodyFixedEyeM(parent.pose);
    const rangeM = Math.hypot(eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]);
    return rangeM / meshBodyOf(focusId).boundingRadiusM < ctx.tuning.siteEngageR
      ? { site: focusId }
      : null;
  },

  release(framed, ctx) {
    // Nothing is hosted on a site, so its subtree is the site itself: any other
    // focus hands back to the host arm (§4.8), as the band edge does.
    if (!focusInSubtree(ctx.focusBodyId, framed.frame.site)) return true;
    const rangeR = framed.pose.rangeM / meshBodyOf(framed.frame.site).boundingRadiusM;
    return rangeR > ctx.tuning.siteDisengageR;
  },
};
