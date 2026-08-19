/**
 * createOrbitCameraInput — the orbit camera and the pointer/wheel input that
 * drives it. They live together because every field here is written by a
 * handler and read by the frame loop a tick later; `createGalaxyEngine` holds
 * only the returned handle and reads the resolved view out of `update`.
 *
 * `update` takes `now` rather than reading the clock, which is what makes the
 * idle gate and the interaction timeout reachable from a test. The handlers do
 * call `performance.now()` — a real event has a real time to report.
 */
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { ViewPose } from '../../../@types/engine/ViewPose';

import { exponentialZoomDistance } from '../../../../utils/camera/exponentialZoomDistance';
import { orbitDragDelta } from '../../../../utils/camera/orbitDragDelta';
import { lensShift } from './lensShift';
import { orbitEye } from './orbitEye';
import { panAxes } from './panAxes';

/**
 * One frame's resolved view. `dist` is the DAMPED distance, which is what the
 * near/far planes must track — using the live one would snap the frustum a
 * frame ahead of the image and clip through the disc mid-zoom.
 */
type ResolvedView = {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  readonly dist: number;
};

type OrbitCameraInput = {
  /** Advance the damped camera and return this frame's resolved view. */
  update(dt: number, now: number): ResolvedView;
  setView(pose: Partial<ViewPose>): void;
  setAutoRotate(on: boolean): void;
  setInsets(left: number, right: number): void;
  getCamera(): ViewPose;
  /** Horizontal lens shift for the current insets — see `lensShift`. */
  shiftX(clientWidthPx: number): number;
  dispose(): void;
};

export function createOrbitCameraInput(
  canvas: HTMLCanvasElement,
  options: { readonly autoRotate: boolean },
): OrbitCameraInput {
  // ---- camera state (orbit) ----
  const cam = { az: 0.5, el: 1.05, dist: 31, target: [0, 0, 0] as Vec3, fov: (45 * Math.PI) / 180 };
  const camAnim = { az: cam.az, el: cam.el, dist: cam.dist }; // damped shadow copy
  let autoRotate = options.autoRotate;
  let insetL = 0;
  let insetR = 0; // CSS px occupied by side panels (for off-center framing)
  let lastInteract = performance.now();

  // ---- input ----
  let dragging = false;
  let panning = false;
  let lx = 0;
  let ly = 0;
  const onDown = (e: PointerEvent): void => {
    dragging = true;
    panning = e.button === 2 || e.button === 1;
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    if (panning) {
      // Right/middle-drag pans: shift the orbit target along the camera's right & up axes.
      const { right, up } = panAxes(camAnim.az, camAnim.el);
      const s = camAnim.dist * 0.0016; // screen-constant pan speed
      const dx = (e.clientX - lx) * s;
      const dy = (e.clientY - ly) * s;
      for (let i = 0; i < 3; i++) cam.target[i] = cam.target[i]! + (-right[i]! * dx + up[i]! * dy);
    } else {
      const { dYaw, dPitch } = orbitDragDelta(e.clientX - lx, e.clientY - ly, 0.006);
      cam.az += dYaw;
      cam.el += dPitch;
      cam.el = Math.max(-1.5, Math.min(1.5, cam.el));
    }
    lx = e.clientX;
    ly = e.clientY;
    lastInteract = performance.now();
  };
  const onUp = (): void => {
    dragging = false;
    panning = false;
    lastInteract = performance.now();
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Exponential, so a notch is a constant RATIO — the only zoom that behaves
    // the same at 3000 units out and at 0.02. The rate is up from the old
    // short-range value to keep a full traverse a similar number of notches now
    // that the range spans five decades instead of two.
    cam.dist = exponentialZoomDistance(cam.dist, e.deltaY, 0.0018);
    // The floor is deep inside the disc, where sprites resolve into individual
    // billboards — the regime the app hits on descent and the one worth tuning
    // against. It works only because the near plane tracks `dist`.
    //
    // The CEILING is set by the apparent-size fade band, not by taste: the disc
    // is 21 generator units across, so at 400 it still spans tens of pixels and
    // the band (edges at 12 / 8 px) could not fire at any reachable zoom. That
    // band is keyed on PIXELS: apparent diameter is ~25.35 * viewportHeight /
    // dist, so a taller canvas needs a further camera to reach the same px. At
    // dpr 2 an 8 px disc is ~5700 units, so a 3000 ceiling would leave the band
    // never firing on a retina display — and the FADE section untestable there.
    // 8000 clears it with margin, and the far plane (dist * 2 + 200) still
    // contains the cloud there.
    cam.dist = Math.max(0.02, Math.min(8000, cam.dist));
    lastInteract = performance.now();
  };
  const onContextMenu = (e: Event): void => e.preventDefault(); // allow right-drag to pan
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    update(dt: number, now: number): ResolvedView {
      // idle auto-rotate
      if (autoRotate && now - lastInteract > 2500 && !dragging) cam.az += dt * 0.12;
      // damping
      const k = Math.min(1, dt * 10);
      camAnim.az += (cam.az - camAnim.az) * k;
      camAnim.el += (cam.el - camAnim.el) * k;
      camAnim.dist += (cam.dist - camAnim.dist) * k;

      return {
        eye: orbitEye(camAnim.az, camAnim.el, camAnim.dist, cam.target),
        target: cam.target,
        fov: cam.fov,
        dist: camAnim.dist,
      };
    },

    setView(pose: Partial<ViewPose>): void {
      if (pose.az != null) cam.az = pose.az;
      if (pose.el != null) cam.el = pose.el;
      if (pose.dist != null) cam.dist = pose.dist;
      lastInteract = performance.now();
    },

    setAutoRotate(on: boolean): void {
      autoRotate = on;
      // Both halves make the toggle immediate. Starting clears the idle gate in
      // `update`: that gate exists so the spin does not fight a live drag, not
      // to delay a deliberate button press, and a press right after a drag would
      // otherwise sit still for 2.5 s. Stopping snaps the damped shadow onto the
      // live angle — while rotating, `camAnim.az` trails `cam.az` by a constant
      // offset, and letting that offset unwind reads as a coast after the button
      // already said stop.
      if (on) lastInteract = Number.NEGATIVE_INFINITY;
      else camAnim.az = cam.az;
    },

    setInsets(left: number, right: number): void {
      insetL = left || 0;
      insetR = right || 0;
    },

    getCamera: (): ViewPose => ({ az: cam.az, el: cam.el, dist: cam.dist }),

    shiftX: (clientWidthPx: number): number => lensShift(insetL, insetR, clientWidthPx),

    dispose(): void {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
