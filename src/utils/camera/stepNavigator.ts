/**
 * One frame of the OpenSpace navigator: OpenSpace v0.22.0's `DampenedVelocity`
 * law on four axes, with `k = min(dt / friction, 1)`. While a gesture is open
 * every axis eases toward the pointer's velocity on it, zero on an axis it did
 * not move (`set`, never gated by the friction toggles, so a motionless press
 * stops a coast); once released an axis decays by `1 − k` (`decelerate`) only
 * while its group's toggle is on. Velocities are ArmDelta units per second; the
 * returned delta is one frame's worth, zero axes omitted because an
 * `orbit: [0, 0]` is not identity on the world arm.
 */
import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { NavAxis } from '../../@types/camera/NavAxis';
import type { NavigatorState } from '../../@types/camera/NavigatorState';
import type { NavSettings } from '../../@types/camera/NavSettings';
import type { NavStep } from '../../@types/camera/NavStep';
import type { Vec2 } from '../../@types/math/Vec2';
import {
  NAV_DT_CAP_MS,
  NAV_FRICTION_EPS,
  NAV_FRICTION_GROUP,
  NAV_REST_EPS,
  NAV_ROTATION_GAIN,
  NAV_ZOOM_LN_PER_PX,
} from '../../data/camera/openSpaceNavigation';

export function stepNavigator(
  prev: NavigatorState,
  steps: readonly NavStep[],
  held: boolean,
  nowMs: number,
  settings: NavSettings,
  radPerPx: number,
): { readonly state: NavigatorState; readonly delta: ArmDelta; readonly moving: boolean } {
  const rawDtMs = prev.lastNowMs === null ? 0 : Math.max(nowMs - prev.lastNowMs, 0);
  const dtS = Math.min(rawDtMs, NAV_DT_CAP_MS) / 1000;
  // The hold target divides by the REAL gap: a stall's pixels were gathered over
  // all of it, and the capped dt would turn them into a fling.
  const rawDtS = rawDtMs / 1000;
  const k = Math.min(dtS / (settings.friction + NAV_FRICTION_EPS), 1);

  const v = {
    orbit: [...prev.velocity.orbit] as Vec2,
    look: [...prev.velocity.look] as Vec2,
    zoom: prev.velocity.zoom,
    roll: prev.velocity.roll,
  };
  let heldThisFrame = false;
  const hold = (axis: NavAxis, px: Vec2): void => {
    if (axis === 'zoom') {
      v.zoom += ((px[1] * NAV_ZOOM_LN_PER_PX) / rawDtS - v.zoom) * k;
    } else if (axis === 'roll') {
      v.roll += ((px[0] * NAV_ROTATION_GAIN.roll * radPerPx) / rawDtS - v.roll) * k;
    } else {
      const rate = (NAV_ROTATION_GAIN[axis] * radPerPx) / rawDtS;
      const w = v[axis];
      w[0] += (px[0] * rate - w[0]) * k;
      w[1] += (px[1] * rate - w[1]) * k;
    }
  };

  const noPixels = (): Record<NavAxis, Vec2> => ({
    orbit: [0, 0],
    look: [0, 0],
    zoom: [0, 0],
    roll: [0, 0],
  });
  const holdAll = (px: Record<NavAxis, Vec2>): void => {
    heldThisFrame = true;
    if (dtS === 0) return;
    for (const axis of ['orbit', 'look', 'zoom', 'roll'] as const) hold(axis, px[axis]);
  };
  // Each gesture this frame holds once over its pixels; a `gestureEnd` closes one.
  let acc = noPixels();
  for (const step of steps) {
    if (step.kind === 'navDrag') {
      const a = acc[step.axis];
      acc[step.axis] = [a[0] + step.deltaPx[0], a[1] + step.deltaPx[1]];
    } else {
      holdAll(acc);
      acc = noPixels();
    }
  }
  if (held) holdAll(acc);

  const decays = (axis: NavAxis): boolean =>
    !heldThisFrame && settings.frictionOn[NAV_FRICTION_GROUP[axis]];
  for (const axis of ['orbit', 'look'] as const) {
    const s = decays(axis) ? 1 - k : 1;
    v[axis] =
      Math.hypot(v[axis][0], v[axis][1]) * s < NAV_REST_EPS
        ? [0, 0]
        : [v[axis][0] * s, v[axis][1] * s];
  }
  for (const axis of ['zoom', 'roll'] as const) {
    const scaled = v[axis] * (decays(axis) ? 1 - k : 1);
    v[axis] = Math.abs(scaled) < NAV_REST_EPS ? 0 : scaled;
  }

  const orbitOn = v.orbit[0] !== 0 || v.orbit[1] !== 0;
  const lookOn = v.look[0] !== 0 || v.look[1] !== 0;
  const moving = orbitOn || lookOn || v.zoom !== 0 || v.roll !== 0;
  // dt 0 moves nothing, and an all-zero orbit would still re-run the drag law.
  const delta: ArmDelta =
    dtS === 0
      ? {}
      : {
          ...(orbitOn && { orbit: [v.orbit[0] * dtS, v.orbit[1] * dtS] }),
          ...(lookOn && { look: [v.look[0] * dtS, v.look[1] * dtS] }),
          ...(v.zoom !== 0 && { zoom: v.zoom * dtS }),
          ...(v.roll !== 0 && { roll: v.roll * dtS }),
        };
  return { state: { velocity: v, lastNowMs: nowMs }, delta, moving };
}
