/**
 * vrSpike — THROWAWAY (Quest 3 WebXR spike, 2026-08-22).
 *
 * `?vr` in the URL installs an "Enter VR" button that opens an immersive-vr
 * session via XRGPUBinding (Quest Browser 146+, behind the "WebXR
 * experimental features" flag) and drives the existing engine frame loop
 * per-eye: the XR rAF replaces the scheduler, per-eye view matrices are
 * built here from the orbit camera anchor, and renderFrame walks the frame
 * program once per eye into the projection layer's textures.
 *
 * World mapping: the XR reference space (metres) is anchored at the live
 * orbit camera — origin at the eye, axes = the camera's image plane basis,
 * scale METERS_TO_MPC = orbit distance / SCALE_DIVISOR at session start. So
 * the orbit pivot sits SCALE_DIVISOR metres in front of the viewer and head
 * translation gives real stereo parallax against nearby content.
 *
 * Known spike caveats (accepted, not bugs to fix here): labels project with
 * the mono orbit vp (render at infinity), pick/UI are dead in-session, the
 * canvas swap chain idles while the session runs.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../@types/math/Vec3';
import { runFrame } from '../engine/frame/runFrame';
import { assembleOrbitCamera } from '../engine/camera/assembleOrbitCamera';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { imagePlaneBasis } from '../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../utils/camera/frameUp';
import {
  vrOverride,
  tangentsOf,
  viewFromBasis,
  viewFromBasisOriginRelative,
} from './vrSpikeState';
import type { VrEye } from './vrSpikeState';

/** Orbit-pivot distance in metres inside the headset (world scale knob). */
const SCALE_DIVISOR = 4;

// Minimal ambient shims for the WebXR surface the spike touches — the DOM lib
// has no XRGPUBinding types yet. All spike-local, all erased with the spike.
type XRViewish = {
  transform: { matrix: Float32Array };
  projectionMatrix: Float32Array;
};
type XRFrameish = {
  getViewerPose(ref: unknown): { views: XRViewish[] } | null;
};
type XRSessionish = {
  requestReferenceSpace(kind: string): Promise<unknown>;
  updateRenderState(state: unknown): void;
  requestAnimationFrame(cb: (time: number, frame: XRFrameish) => void): number;
  addEventListener(type: string, cb: () => void): void;
  end(): Promise<void>;
};
type XRGPUBindingish = {
  getPreferredColorFormat(): GPUTextureFormat;
  createProjectionLayer(init: unknown): XRProjectionLayerish;
  getViewSubImage(layer: XRProjectionLayerish, view: XRViewish): XRGPUSubImageish;
};
type XRProjectionLayerish = { textureWidth: number; textureHeight: number };
type XRGPUSubImageish = {
  colorTexture: GPUTexture;
  getViewDescriptor(): GPUTextureViewDescriptor;
  viewport: { x: number; y: number; width: number; height: number };
};

export function installVrSpike(state: EngineState, frameDeps: RunFrameDeps): void {
  const xr = (navigator as unknown as { xr?: { requestSession(mode: string, init?: unknown): Promise<XRSessionish> } }).xr;
  const XRGPUBindingCtor = (window as unknown as { XRGPUBinding?: new (s: XRSessionish, d: GPUDevice) => XRGPUBindingish }).XRGPUBinding;
  if (!xr || !XRGPUBindingCtor) {
    console.warn('[vrSpike] navigator.xr or XRGPUBinding missing — enable "WebXR experimental features" in chrome://flags');
    return;
  }

  const button = document.createElement('button');
  button.textContent = 'Enter VR';
  button.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1000;' +
    'padding:10px 22px;font:600 15px system-ui;border-radius:8px;border:1px solid #4c6;' +
    'background:#0b2;color:#fff;cursor:pointer;';
  document.body.append(button);

  button.onclick = () => {
    button.disabled = true;
    startSession(state, frameDeps, xr, XRGPUBindingCtor)
      .catch((e: unknown) => {
        console.error('[vrSpike] session failed', e);
        button.disabled = false;
      });
  };
}

async function startSession(
  state: EngineState,
  frameDeps: RunFrameDeps,
  xr: { requestSession(mode: string, init?: unknown): Promise<XRSessionish> },
  XRGPUBindingCtor: new (s: XRSessionish, d: GPUDevice) => XRGPUBindingish,
): Promise<void> {
  const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['webgpu'] });
  const binding = new XRGPUBindingCtor(session, frameDeps.device);

  const colorFormat = binding.getPreferredColorFormat();
  const swapFormat = state.gpu.renderTargets?.specOf('swap').format;
  if (swapFormat !== undefined && swapFormat !== colorFormat) {
    // Overlay pipelines were baked against the canvas swap format at init;
    // a mismatch here renders garbage or validation-errors every frame.
    console.warn(`[vrSpike] XR layer format ${colorFormat} != swap format ${swapFormat} — expect validation errors`);
  }

  const layer = binding.createProjectionLayer({ colorFormat, textureType: 'texture-array' });
  session.updateRenderState({ layers: [layer] });
  const refSpace = await session.requestReferenceSpace('local');

  // Freeze the world scale at session start: pivot lands SCALE_DIVISOR metres
  // out. Frozen (not live) so head translation can't feedback into the scale.
  const metersToMpc = Math.max(state.cameraRuntime.lastPose.current.distance, 1e-12) / SCALE_DIVISOR;

  // Size the canvas backing store to the per-eye texture so renderTargets
  // reconciles the offscreen chain (HDR, bloom, half-res upsamples) to XR
  // resolution through the normal path. runFrame's resize guard is off while
  // the override is active, so nothing fights this.
  const savedCanvas = { w: frameDeps.canvas.width, h: frameDeps.canvas.height };
  frameDeps.canvas.width = Math.max(1, layer.textureWidth);
  frameDeps.canvas.height = Math.max(1, layer.textureHeight);

  vrOverride.active = true;
  vrOverride.eyes = [];
  let warnedViewport = false;

  session.addEventListener('end', () => {
    vrOverride.active = false;
    vrOverride.eyes = [];
    frameDeps.canvas.width = savedCanvas.w;
    frameDeps.canvas.height = savedCanvas.h;
    state.subsystems.scheduler.requestRender();
  });

  const onXRFrame = (time: number, frame: XRFrameish): void => {
    if (!vrOverride.active) return;
    session.requestAnimationFrame(onXRFrame);
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    // ── Anchor: the live orbit camera, reassembled from last frame's pose ──
    const store = frameDeps.cb.store.getState();
    const cam = assembleOrbitCamera(
      state.cameraRuntime.lastPose.current,
      state.cameraRuntime.projection,
      ORIENTATION_FRAMES[store.settings.orientation],
      state.cameraRuntime.upBasis.current,
    );
    const P = cam.position;
    const f: Vec3 = [cam.target[0] - P[0], cam.target[1] - P[1], cam.target[2] - P[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl;
    f[1] /= fl;
    f[2] /= fl;
    const basis = imagePlaneBasis(f, cam.roll ?? 0, frameUp(cam.upBasis));
    // Anchor columns: XR x→camera right, XR y→image-plane up, XR z→backward.
    const AX = basis.right;
    const AY = basis.up;
    const AZ: Vec3 = [-f[0], -f[1], -f[2]];

    const eyes: VrEye[] = [];
    for (const view of pose.views) {
      const sub = binding.getViewSubImage(layer, view);
      if (!warnedViewport && (sub.viewport.x !== 0 || sub.viewport.y !== 0)) {
        console.warn('[vrSpike] non-zero subimage viewport — side-by-side layout unsupported by the spike');
        warnedViewport = true;
      }
      const m = view.transform.matrix; // eye→reference, col-major, metres
      // Eye basis columns in XR reference space.
      const ex: Vec3 = [m[0]!, m[1]!, m[2]!];
      const ey: Vec3 = [m[4]!, m[5]!, m[6]!];
      const ez: Vec3 = [m[8]!, m[9]!, m[10]!];
      const ep: Vec3 = [m[12]!, m[13]!, m[14]!];
      // Rotate through the anchor into world space: v_world = A · v_xr.
      const rot = (v: Vec3): Vec3 => [
        AX[0] * v[0] + AY[0] * v[1] + AZ[0] * v[2],
        AX[1] * v[0] + AY[1] * v[1] + AZ[1] * v[2],
        AX[2] * v[0] + AY[2] * v[1] + AZ[2] * v[2],
      ];
      const X = rot(ex);
      const Y = rot(ey);
      const Z = rot(ez);
      const off = rot(ep);
      const eyeWorld: Vec3 = [
        P[0] + metersToMpc * off[0],
        P[1] + metersToMpc * off[1],
        P[2] + metersToMpc * off[2],
      ];

      const tan = tangentsOf(view.projectionMatrix);
      eyes.push({
        viewCosmo: viewFromBasis(new Float32Array(16), X, Y, Z, eyeWorld),
        viewNear0: viewFromBasisOriginRelative(X, Y, Z, eyeWorld),
        tan,
        camPos: eyeWorld,
        textureView: sub.colorTexture.createView(sub.getViewDescriptor()),
      });
    }

    if (eyes.length > 0) {
      const t0 = eyes[0]!.tan;
      vrOverride.fovYRad = Math.atan(t0.u) - Math.atan(t0.d);
    }
    vrOverride.eyes = eyes;
    runFrame(state, frameDeps, time);
  };
  session.requestAnimationFrame(onXRFrame);
}
