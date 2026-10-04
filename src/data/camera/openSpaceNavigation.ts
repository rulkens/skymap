/**
 * The OpenSpace navigator's constants (`stepNavigator`). Friction and its guard
 * follow OpenSpace v0.22.0's `DampenedVelocity`; the gains are seeds tuned by feel.
 */
import type { CameraControlsSettings } from '../../@types/settings/CameraControlsSettings';
import type { FrictionGroup } from '../../@types/camera/FrictionGroup';
import type { NavAxis } from '../../@types/camera/NavAxis';
import type { NavigatorState } from '../../@types/camera/NavigatorState';

// OpenSpace's `velocityScaleFromFriction` guard: friction 0 divides by this, not by 0.
export const NAV_FRICTION_EPS = 1e-7;

// A stalled tab must not turn one frame into a long free coast.
export const NAV_DT_CAP_MS = 100;

/** Per axis, ArmDelta units per second; below it the axis snaps to exactly 0. */
export const NAV_REST_EPS = 1e-4;

/** Multiples of the drag's own rate, `fovY / cssHeight` radians per pixel. */
export const NAV_ROTATION_GAIN: Readonly<Record<Exclude<NavAxis, 'zoom'>, number>> = {
  orbit: 1,
  look: 1,
  roll: 1,
};

export const NAV_ZOOM_LN_PER_PX = 0.005;

// OpenSpace's `rotational` toggle gates only orbit; its `roll` toggle gates look and roll.
export const NAV_FRICTION_GROUP: Readonly<Record<NavAxis, FrictionGroup>> = {
  orbit: 'rotational',
  look: 'roll',
  roll: 'roll',
  zoom: 'zoom',
};

export const NAV_AT_REST: NavigatorState = {
  velocity: { orbit: [0, 0], look: [0, 0], zoom: 0, roll: 0 },
  held: null,
  lastNowMs: null,
};

// OpenSpace's own friction defaults; the skymap scheme drives until the user opts in.
export const DEFAULT_CAMERA_CONTROLS: CameraControlsSettings = {
  scheme: 'skymap',
  friction: 0.5,
  frictionOn: { rotational: true, zoom: true, roll: true },
};
