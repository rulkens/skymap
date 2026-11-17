/**
 * CameraAim — a re-aim token: each `aimCamera` writes a new one, and a driver keyed on its
 * identity starts a new view. `ease` false cuts (an exhibit's entry, which cuts or arrives on its
 * own fly-in); true eases from the pose on screen (a step, a craft switch, a mid-fly-in re-aim).
 */

export type CameraAim = { readonly ease: boolean };
