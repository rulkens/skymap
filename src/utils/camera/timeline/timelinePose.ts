/**
 * timelinePose — the timeline driver's pose: the selected lane's timeline frame at this frame's
 * instant, looked at along its normal turned by the visitor's offsets. A view change (an easing
 * re-aim, a hand-off to another stop or view regime) eases from the pose last shown over
 * `TIMELINE_EASE_MS` of WALL time on the aim epoch, so it reads the same at every clock speed and
 * still finishes on a paused clock. Offsets are read from a live drag or a swallowed wheel notch
 * and hold until the next view change, which resets them. Yaw and pitch come from
 * `orbitAnglesLookingAlong` in the committed basis; an inverse here would drift off-equatorial.
 */

import type { CameraPose } from '../../../@types/camera/pose/CameraPose';
import type { Vec3 } from '../../../../packages/shared/src/@types/math/Vec3';
import type { DriverCtx } from '../../../@types/engine/camera/DriverCtx';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { DriverOutput } from '../../../@types/engine/camera/DriverOutput';
import type { TimelineCameraMemory } from '../../../@types/camera/timeline/TimelineCameraMemory';
import type { TimelineCourse } from '../../../@types/camera/timeline/TimelineCourse';
import type { TimelineOffsets } from '../../../@types/camera/timeline/TimelineOffsets';
import type { ExhibitTimelineData } from '../../../@types/exhibits/timeline/ExhibitTimelineData';
import { TIMELINE_EASE_MS } from '../../../data/camera/timeline/timelineEaseMs';
import { TIMELINE_SURFACE_STANDOFF } from '../../../data/camera/timeline/timelineSurfaceStandoff';
import { TIMELINE_FRAME_MARGIN } from '../../../data/camera/timeline/timelineFrameMargin';
import { NO_TIMELINE_OFFSETS } from '../../../data/camera/timeline/noTimelineOffsets';
import { absoluteArm } from '../arms/absoluteArm';
import { blendCameraPose } from '../orbitPose/blendCameraPose';
import { bodyRadiusMpc } from '../surfaceFrame/bodyRadiusMpc';
import { distanceOutsideSphere } from '../orbitCamera/distanceOutsideSphere';
import { eyeMpcOf } from '../orbitPose/eyeMpcOf';
import { timelineCameraFrame } from './timelineCameraFrame';
import { timelineOffsetsOfView } from './timelineOffsetsOfView';
import { timelineViewDirection } from './timelineViewDirection';
import { timelineStops } from './timelineStops';
import { orbitAnglesLookingAlong } from '../orbitPose/orbitAnglesLookingAlong';
import { sphereFitDistance } from '../orbitCamera/sphereFitDistance';
import { lerpVec3 } from '../../../../packages/shared/src/utils/math/lerpVec3';
import { normalize3 } from '../../../../packages/shared/src/utils/math/normalize3';
import { smoothstep } from '../../math/smoothstep';
import { isSceneBodyId } from '../../scene/isSceneBodyId';

/** One craft's stops per timeline, by identity: rebuilt only when the data or the craft changes. */
const STOPS = new WeakMap<ExhibitTimelineData, Map<string, TimelineCourse['stops']>>();

function stopsOf(data: ExhibitTimelineData, craftId: string): TimelineCourse['stops'] {
  const byCraft = STOPS.get(data) ?? STOPS.set(data, new Map()).get(data)!;
  const hit = byCraft.get(craftId);
  if (hit) return hit;
  const stops = timelineStops(data.events.filter((e) => e.bodyId === craftId));
  byCraft.set(craftId, stops);
  return stops;
}

export function timelinePose(
  ctx: DriverCtx,
  mem: FollowMemory | null,
  own: TimelineCameraMemory | null,
  data: ExhibitTimelineData,
): DriverOutput<TimelineCameraMemory> {
  // The exhibit's snapshot always sets the craft before this row can win.
  const craftId = ctx.state.settings.timeline.lane;
  if (craftId === null) return { pose: ctx.state.camera.intent.base, memory: mem };
  const course: TimelineCourse = { craftId, stops: stopsOf(data, craftId), cruise: data.cruise };
  const token = ctx.state.camera.intent.aim;
  const now = ctx.elapsedMs;
  const { fovYRad, aspect } = ctx.projection;
  const positionOf = (id: string) =>
    isSceneBodyId(id) ? ctx.bodies.get(id)?.positionMpc : undefined;
  // A new aim token also restarts the epoch these times are on; an easing one keeps the offsets.
  const sameAim = own !== null && own.aim === token;
  const prev = sameAim ? own.view : null;
  const kept = (sameAim || token?.ease) && own !== null ? own.offsets : NO_TIMELINE_OFFSETS;
  const frame = timelineCameraFrame(
    course,
    ctx.simDays,
    positionOf,
    fovYRad,
    aspect,
    ctx.poseBasis,
    prev?.cruise ?? null,
  );
  if (frame === null) return { pose: ctx.state.camera.intent.base, memory: mem };

  // A new view (another framed stop, or flyby to cruise and back) starts on its auto view; the
  // ease into it below departs from what the visitor saw, so the reset does not snap.
  const viewChanged = prev !== null && (frame.stop !== prev.stop || frame.cruise !== prev.cruise);
  let offsets: TimelineOffsets = viewChanged ? NO_TIMELINE_OFFSETS : kept;
  const dragged = ctx.state.input.owner !== null;
  const touched = dragged || ctx.followDistanceTarget !== null;
  if (dragged) {
    // The drag arm stepped last frame's pose; its view and distance ARE the new offsets, re-posed
    // below about this frame's aim, so the craft stays put on screen while the clock plays.
    const w = ctx.authoredWorld;
    const eye = eyeMpcOf(w, ctx.poseBasis);
    const view = normalize3([w.target[0] - eye[0], w.target[1] - eye[1], w.target[2] - eye[2]]);
    offsets = timelineOffsetsOfView(frame, view, w.distance);
  } else if (ctx.followDistanceTarget !== null) {
    offsets = { ...offsets, zoom: ctx.followDistanceTarget / frame.distance };
  }
  // Zoomed in past the auto framing, the eye keeps its distance instead of riding the frame as it
  // shrinks toward the next planet, so the craft holds its size; once the frame has shrunk to that
  // distance the view rides it (zoom 1). Written back, or the next frame re-reads the stale zoom.
  const holding = !touched && !viewChanged && prev !== null && offsets.zoom < 1;
  if (holding) offsets = { ...offsets, zoom: Math.min(1, prev.distance / frame.distance) };

  // The distance that fits the craft's frame sphere about `target`, as the exact frame does.
  const craft = positionOf(course.craftId);
  const fitAbout = (target: Readonly<Vec3>): number =>
    craft === undefined
      ? 0
      : sphereFitDistance(
          Math.hypot(craft[0] - target[0], craft[1] - target[1], craft[2] - target[2]) *
            TIMELINE_FRAME_MARGIN,
          fovYRad,
          aspect,
        ) * offsets.zoom;

  // A first frame eases only after a re-aim (an entry cuts or arrives on a fly-in); a view change
  // starts again from what the visitor sees, so nothing jumps.
  let from = prev?.from ?? null;
  let easeAtMs = prev?.easeAtMs ?? now;
  let shortfall = prev?.shortfall ?? 1;
  const easing = from !== null && now - easeAtMs < TIMELINE_EASE_MS;
  const started = prev === null ? (token?.ease ?? false) : viewChanged;
  if (started) {
    from = ctx.authoredWorld;
    easeAtMs = now;
  } else if (!easing) from = null;
  // The start pose rides with the craft, or a playing clock (or a step's jump) drags the blend back
  // to where the system was: by the craft's move since last frame, if this row drew it of this craft.
  const last = own?.craft?.id === craftId ? own.craft.positionMpc : undefined;
  if (from !== null && craft && last && ctx.winnerLastFrame === 'timeline') {
    const t = from.target;
    from = {
      ...from,
      target: [t[0] + craft[0] - last[0], t[1] + craft[1] - last[1], t[2] + craft[2] - last[2]],
    };
  }
  if (started && from !== null) shortfall = Math.min(1, from.distance / fitAbout(from.target));

  const distance = frame.distance * offsets.zoom;
  const { yaw, pitch } = orbitAnglesLookingAlong(
    timelineViewDirection(frame, offsets),
    ctx.poseBasis,
  );
  // Zooming in slides the aim from the frame's midpoint to the craft, so the close view is of the
  // craft and not of a point that, at a launch, lies inside the planet.
  const aim =
    craft !== undefined && offsets.zoom < 1
      ? lerpVec3(frame.aim, craft, 1 - offsets.zoom)
      : frame.aim;
  const exact = { target: aim, yaw, pitch, distance };
  let shown: CameraPose = exact;
  if (from !== null) {
    const s = smoothstep(0, TIMELINE_EASE_MS, now - easeAtMs);
    const blend = blendCameraPose(from, exact, s);
    // A blended centre can leave the craft outside a log-blended distance, so the distance never
    // falls under the craft's fit. A start pose not carried (another craft, another row's pose)
    // can leave the craft out of it; that shortfall fades over the ease rather than snapping out.
    const floor = fitAbout(blend.target) * shortfall ** (1 - s);
    shown = { ...blend, distance: Math.max(blend.distance, floor) };
  }

  // The eye never goes inside the framed planet (the Sun when the frame has none). A floored exact
  // pose writes its zoom back so further notches do not pile up below the floor.
  const planet = positionOf(frame.stop?.planetId ?? 'sun');
  const eye = eyeMpcOf({ ...shown, distance: 1 }, ctx.poseBasis);
  const floored =
    planet === undefined
      ? shown.distance
      : distanceOutsideSphere(
          shown.target,
          [eye[0] - shown.target[0], eye[1] - shown.target[1], eye[2] - shown.target[2]],
          shown.distance,
          planet,
          bodyRadiusMpc(frame.stop?.planetId ?? undefined) * TIMELINE_SURFACE_STANDOFF,
        );
  if (floored !== shown.distance) {
    if (from === null) offsets = { ...offsets, zoom: floored / frame.distance };
    shown = { ...shown, distance: floored };
  }

  return {
    pose: absoluteArm(shown),
    // The wheel only routes a notch to a row whose memory names its distance; `saturated`
    // false keeps the render loop awake through an ease on a paused clock.
    memory: {
      from: null,
      distanceTarget: shown.distance,
      durationMs: null,
      panOffset: mem?.panOffset ?? [0, 0, 0],
      saturated: from === null,
    },
    own: {
      aim: token,
      offsets: touched || viewChanged || holding ? offsets : kept,
      craft: craft === undefined ? null : { id: craftId, positionMpc: craft },
      view: {
        stop: frame.stop,
        cruise: frame.cruise,
        from,
        easeAtMs,
        shortfall,
        distance: frame.distance * offsets.zoom,
      },
    },
    pivotBody: isSceneBodyId(craftId) ? craftId : undefined,
  };
}
