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
 * World mapping: world-fixed Earth. Earth's live centre (Mpc) is placed at a
 * fixed point in XR 'local' space — 1.75 m in front of the session-start head
 * pose, at head height — scaled so Earth reads as a 0.75 m-radius globe
 * (metersToMpc = EARTH_RADIUS_MPC / 0.75, a session-start constant). The
 * anchor rotation basis is captured ONCE at session start (not reassembled
 * per frame): freezing it is what makes the virtual world rigid so the user
 * can walk around Earth, at the cost of orbit-camera rotation (tweens, drag)
 * no longer steering the VR view — fine for the spike. Position still comes
 * from Earth's live centre each frame (it barely moves), so rotation freezes
 * while translation doesn't.
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
import { deriveBodyStates } from '../engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  vrOverride,
  tangentsOf,
  viewFromBasis,
  viewFromBasisOriginRelative,
} from './vrSpikeState';
import type { VrEye, EyeTangents } from './vrSpikeState';

/** Earth's apparent radius inside the headset, metres (user request: ~1.5 m tall globe). */
const EARTH_RADIUS_TARGET_M = 0.75;
/** Head → Earth-centre distance in XR 'local' space, metres (Earth's near edge ~1 m out). */
const HEAD_TO_EARTH_CENTER_M = 1.75;
/** Earth's target position in 'local' space: straight ahead of the session-start head, at head height. */
const E_XR: Vec3 = [0, 0, -HEAD_TO_EARTH_CENTER_M];

// ── Thumbsticks: right = zoom, left = orbit ────────────────────────────────
/** Ignore stick noise below this magnitude (xr-standard axes rest near 0 but rarely at exactly 0). */
const STICK_DEADZONE = 0.15;
/** Full deflection ≈ doubling/halving metersToMpc per second (e^ln2 = 2). */
const ZOOM_RATE = Math.LN2;
/** Earth's apparent radius is kept inside this range regardless of zoom input. */
const EARTH_APPARENT_RADIUS_MIN_M = 0.02;
const EARTH_APPARENT_RADIUS_MAX_M = 2000;
/** Full deflection ≈ 1.2 rad/s of orbit yaw/pitch. */
const ORBIT_RATE = 1.2;
/** Pitch clamp — beyond this the view flips past Earth's poles. */
const ORBIT_PITCH_LIMIT_RAD = 1.5;

type StickAxes = { x: number; y: number };

/**
 * One controller's thumbstick {x, y}, xr-standard gamepad mapping (axes[2..3];
 * 2-axis pads with no touchpad expose the thumbstick at axes[0..1]). Prefers
 * `handedness`, falling back to any xr-standard gamepad found (matches the
 * original zoom-only fallback so a single-controller session still zooms).
 */
function readStickAxes(session: XRSessionish, handedness: 'left' | 'right'): StickAxes {
  let matched: StickAxes | null = null;
  let any: StickAxes | null = null;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp || gp.mapping !== 'xr-standard') continue;
    const fourAxis = gp.axes.length >= 4;
    const x = fourAxis ? gp.axes[2] : gp.axes[0];
    const y = fourAxis ? gp.axes[3] : gp.axes[1];
    if (x === undefined || y === undefined) continue;
    const axes: StickAxes = { x, y };
    if (any === null) any = axes;
    if (src.handedness === handedness) {
      matched = axes;
      break;
    }
  }
  return matched ?? any ?? { x: 0, y: 0 };
}

/** Rotation about the XR +X axis (pitch), right-hand rule. */
function rotateAboutX(v: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

/** Rotation about the XR +Y axis (yaw), right-hand rule. */
function rotateAboutY(v: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

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
  inputSources: Iterable<XRInputSourceish>;
};
type XRGamepadish = {
  mapping: string;
  axes: ArrayLike<number>;
};
type XRInputSourceish = {
  handedness: string;
  gamepad: XRGamepadish | null | undefined;
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

// ── Spike diagnostics ────────────────────────────────────────────────────────
// First-frame per-eye raw numbers, shown in a <pre> overlay on the 2D page
// after the session ends — the Quest has no convenient console, so the page
// IS the console for this spike. Also console.log'd at capture time
// (one line per call, `[vrSpike-diag]`-prefixed) so `adb logcat` picks them
// up live — Chromium mirrors console output to logcat, which is otherwise
// the only way to see these numbers before the session ends.
const diag: string[] = [];
let diagEl: HTMLPreElement | null = null;

function pushDiag(...lines: string[]): void {
  diag.push(...lines);
  for (const line of lines) console.log(`[vrSpike-diag] ${line}`);
}

function showDiag(): void {
  if (!diagEl) {
    diagEl = document.createElement('pre');
    diagEl.style.cssText =
      'position:fixed;top:8px;left:8px;right:8px;z-index:1001;max-height:70vh;overflow:auto;' +
      'background:rgba(0,0,0,.85);color:#8f8;font:11px/1.4 monospace;padding:10px;white-space:pre-wrap;';
    document.body.append(diagEl);
  }
  diagEl.textContent = diag.join('\n');
}

const f3 = (v: ArrayLike<number>): string =>
  Array.from(v as number[], (x) => (Math.abs(x) < 1e-4 && x !== 0 ? x.toExponential(2) : x.toFixed(4))).join(', ');

// First-frame-only raw capture per eye, gathered inside the pose.views loop
// and graded once both eyes are in — see buildFrameDiagnostics below.
type EyeCapture = {
  ep: Vec3;
  vd: {
    dimension: unknown;
    format: unknown;
    baseArrayLayer: unknown;
    arrayLayerCount: unknown;
    baseMipLevel: unknown;
    mipLevelCount: unknown;
    aspect: unknown;
  };
  texWidth: number;
  texHeight: number;
  texLayers: number;
  viewport: { x: number; y: number; width: number; height: number };
  proj: Float32Array;
  m: Float32Array;
  tan: EyeTangents;
  eyeWorld: Vec3;
};

/**
 * Self-grading first-frame diagnostics. Every field the spike's math depends
 * on gets an explicit [OK]/[OFF] check instead of a raw dump the reader has
 * to eyeball — WebIDL dictionaries (GPUTextureViewDescriptor) don't
 * enumerate for JSON.stringify, so each field here is read out by name.
 */
function buildFrameDiagnostics(
  eyeCaptures: EyeCapture[],
  metersToMpc: number,
  earthApparentRadiusM: number,
  headToEarthCenterM: number,
): { summary: string; body: string[] } {
  const checks: string[] = [];
  let offCount = 0;
  const check = (ok: boolean, name: string, detail: string): void => {
    checks.push(`${ok ? '[OK]' : '[OFF]'} ${name} — ${detail}`);
    if (!ok) offCount += 1;
  };

  check(
    eyeCaptures.length === 2,
    'views per frame',
    `actual=${eyeCaptures.length} expected=2` +
      (eyeCaptures.length === 2 ? '' : ' — FAIL: cross-eye checks below are skipped'),
  );

  eyeCaptures.forEach((e, i) => {
    const expectSign = i === 0 ? 'negative' : 'positive';
    check(
      Math.abs(e.ep[0]) >= 0.02 && Math.abs(e.ep[0]) <= 0.05,
      `eye${i} ep.x magnitude`,
      `actual=${e.ep[0].toFixed(4)} expected=0.02..0.05 (${expectSign})`,
    );
    check(Math.abs(e.ep[1]) < 0.15, `eye${i} ep.y magnitude`, `actual=${e.ep[1].toFixed(4)} expected<0.15`);
    check(Math.abs(e.ep[2]) < 0.15, `eye${i} ep.z magnitude`, `actual=${e.ep[2].toFixed(4)} expected<0.15`);

    const alc = e.vd.arrayLayerCount;
    check(alc === 1 || alc === undefined, `eye${i} arrayLayerCount`, `actual=${String(alc)} expected=1 or undefined`);

    check(
      e.texLayers >= 2,
      `eye${i} colorTexture.depthOrArrayLayers`,
      `actual=${e.texLayers} expected>=2` +
        (e.texLayers >= 2 ? '' : ' — not a texture-array — side-by-side layout, spike assumption broken'),
    );

    const vpOk =
      e.viewport.x === 0 &&
      e.viewport.y === 0 &&
      e.viewport.width === e.texWidth &&
      e.viewport.height === e.texHeight;
    check(
      vpOk,
      `eye${i} viewport === full texture`,
      `actual=${JSON.stringify(e.viewport)} expected={x:0,y:0,width:${e.texWidth},height:${e.texHeight}}` +
        (vpOk ? '' : ' — partial viewport — side-by-side layout, spike renders full-texture and this breaks'),
    );

    const p = e.proj;
    const colMajorOk = Math.abs(p[11]! + 1) < 1e-3;
    if (colMajorOk) {
      check(true, `eye${i} projectionMatrix p[11]`, `actual=${p[11]!.toFixed(4)} expected=-1 (column-major)`);
    } else if (Math.abs(p[14]! + 1) < 1e-3) {
      check(
        false,
        `eye${i} projectionMatrix layout`,
        `p[11]=${p[11]!.toFixed(4)} p[14]=${p[14]!.toFixed(4)} — projection matrix appears ROW-major/transposed — tangent decomposition reads garbage`,
      );
    } else {
      check(false, `eye${i} projectionMatrix p[11]`, `actual=${p[11]!.toFixed(4)} expected=-1`);
    }
    check(Math.abs(p[15]!) < 1e-3, `eye${i} projectionMatrix p[15]`, `actual=${p[15]!.toFixed(4)} expected~0`);
    check(Math.abs(p[3]!) < 1e-3, `eye${i} projectionMatrix p[3]`, `actual=${p[3]!.toFixed(4)} expected~0`);
    check(Math.abs(p[7]!) < 1e-3, `eye${i} projectionMatrix p[7]`, `actual=${p[7]!.toFixed(4)} expected~0`);

    check(e.tan.l < 0 && 0 < e.tan.r, `eye${i} tangents l<0<r`, `actual l=${e.tan.l.toFixed(4)} r=${e.tan.r.toFixed(4)}`);
    check(e.tan.d < 0 && 0 < e.tan.u, `eye${i} tangents d<0<u`, `actual d=${e.tan.d.toFixed(4)} u=${e.tan.u.toFixed(4)}`);
  });

  if (eyeCaptures.length === 2) {
    const [e0, e1] = eyeCaptures as [EyeCapture, EyeCapture];

    const orderOk = e0.ep[0] < 0 && e1.ep[0] > 0;
    const swapped = e0.ep[0] > 0 && e1.ep[0] < 0;
    check(
      orderOk,
      'eye order (ep.x sign)',
      `actual=(${e0.ep[0].toFixed(4)}, ${e1.ep[0].toFixed(4)}) expected=(negative, positive)` +
        (swapped ? ' — eye order swapped' : orderOk ? '' : ' — neither eye matches the expected sign'),
    );

    const bal0 = e0.vd.baseArrayLayer;
    const bal1 = e1.vd.baseArrayLayer;
    check(
      bal0 !== bal1,
      'baseArrayLayer differs across eyes',
      `actual=(${String(bal0)}, ${String(bal1)}) expected=distinct (0 and 1)`,
    );

    check(
      Math.abs(e0.tan.l) > e0.tan.r,
      'left eye outward cant (|l|>r)',
      `actual |l|=${Math.abs(e0.tan.l).toFixed(4)} r=${e0.tan.r.toFixed(4)}`,
    );
    check(
      e1.tan.r > Math.abs(e1.tan.l),
      'right eye outward cant (r>|l|)',
      `actual r=${e1.tan.r.toFixed(4)} |l|=${Math.abs(e1.tan.l).toFixed(4)}`,
    );
    const identicalFrusta =
      e0.tan.l === e1.tan.l && e0.tan.r === e1.tan.r && e0.tan.d === e1.tan.d && e0.tan.u === e1.tan.u;
    check(
      !identicalFrusta,
      'eyes have distinct frusta',
      identicalFrusta ? 'eyes have identical frusta — asymmetry lost' : 'left/right tangents differ',
    );

    const sepWorld = Math.hypot(
      e0.eyeWorld[0] - e1.eyeWorld[0],
      e0.eyeWorld[1] - e1.eyeWorld[1],
      e0.eyeWorld[2] - e1.eyeWorld[2],
    );
    const sepMeters = sepWorld / metersToMpc;
    check(sepWorld > 0, 'eyeWorld positions differ', `actual separation=${sepWorld.toExponential(3)} world units`);
    check(
      sepMeters >= 0.02 && sepMeters <= 0.12,
      'eyeWorld separation ≈ IPD',
      `actual=${sepMeters.toFixed(4)} m expected≈0.055..0.075 m (bounds 0.02..0.12)`,
    );
  }

  check(Number.isFinite(metersToMpc) && metersToMpc > 0, 'metersToMpc finite>0', `actual=${metersToMpc}`);
  check(
    Math.abs(earthApparentRadiusM - EARTH_RADIUS_TARGET_M) < 1e-6,
    'Earth apparent radius = target',
    `actual=${earthApparentRadiusM.toFixed(4)} m expected=${EARTH_RADIUS_TARGET_M} m`,
  );
  check(
    Math.abs(headToEarthCenterM - HEAD_TO_EARTH_CENTER_M) < 0.05,
    'head→Earth-centre distance ≈ target',
    `actual=${headToEarthCenterM.toFixed(4)} m expected≈${HEAD_TO_EARTH_CENTER_M} m`,
  );

  const eyeBlocks: string[] = [];
  eyeCaptures.forEach((e, i) => {
    eyeBlocks.push(`EYE ${i} — pos.x ${i === 0 ? '<' : '>'} 0 ⇒ ${i === 0 ? 'LEFT' : 'RIGHT'}`);
    eyeBlocks.push(
      `dimension: ${String(e.vd.dimension)}`,
      `format: ${String(e.vd.format)}`,
      `baseArrayLayer: ${String(e.vd.baseArrayLayer)}`,
      `arrayLayerCount: ${String(e.vd.arrayLayerCount)}`,
      `baseMipLevel: ${String(e.vd.baseMipLevel)}`,
      `mipLevelCount: ${String(e.vd.mipLevelCount)}`,
      `aspect: ${String(e.vd.aspect)}`,
    );
  });

  const rawDumps: string[] = [];
  eyeCaptures.forEach((e, i) => {
    rawDumps.push(`eye${i} projectionMatrix: ${f3(e.proj)}`, `eye${i} transform matrix m: ${f3(e.m)}`);
  });

  return {
    summary: offCount === 0 ? 'VR DIAG: all checks OK' : `VR DIAG: ${offCount} checks OFF`,
    body: [...checks, ...eyeBlocks, ...rawDumps],
  };
}

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

  const earthBody = state.data.bodies.earth;
  if (earthBody === null) {
    console.warn('[vrSpike] no Earth body seeded — nothing to anchor the VR session on');
    return;
  }
  // Earth-radius-derived world scale (session-start constant — Earth's radius
  // doesn't change at runtime, unlike the old orbit-distance-derived scale).
  const EARTH_RADIUS_MPC = earthBody.radiusKm * SCALE_UNITS.KM_TO_MPC;
  // Mutable: thumbstick zoom rescales this every frame (see onXRFrame below).
  let metersToMpc = EARTH_RADIUS_MPC / EARTH_RADIUS_TARGET_M;
  const metersToMpcMin = EARTH_RADIUS_MPC / EARTH_APPARENT_RADIUS_MAX_M;
  const metersToMpcMax = EARTH_RADIUS_MPC / EARTH_APPARENT_RADIUS_MIN_M;

  const layer = binding.createProjectionLayer({ colorFormat, textureType: 'texture-array' });
  session.updateRenderState({ layers: [layer] });
  const refSpace = await session.requestReferenceSpace('local');

  // ── Anchor rotation basis, frozen once at session start ────────────────
  // World-fixed VR needs a rigid world orientation while the user walks;
  // reassembling this from the live orbit camera every frame (the pre-Earth-
  // anchor version) would spin the world under the user's feet whenever the
  // orbit camera rotates (tweens, drag). Position still tracks Earth's live
  // centre per frame below — only rotation freezes.
  const store0 = frameDeps.cb.store.getState();
  const anchorCam = assembleOrbitCamera(
    state.cameraRuntime.lastPose.current,
    state.cameraRuntime.projection,
    ORIENTATION_FRAMES[store0.settings.orientation],
    state.cameraRuntime.upBasis.current,
  );
  const af: Vec3 = [
    anchorCam.target[0] - anchorCam.position[0],
    anchorCam.target[1] - anchorCam.position[1],
    anchorCam.target[2] - anchorCam.position[2],
  ];
  const afl = Math.hypot(af[0], af[1], af[2]) || 1;
  af[0] /= afl;
  af[1] /= afl;
  af[2] /= afl;
  const anchorBasis = imagePlaneBasis(af, anchorCam.roll ?? 0, frameUp(anchorCam.upBasis));
  // Anchor columns: XR x→camera right, XR y→image-plane up, XR z→backward.
  const AX = anchorBasis.right;
  const AY = anchorBasis.up;
  const AZ: Vec3 = [-af[0], -af[1], -af[2]];
  const rot = (v: Vec3): Vec3 => [
    AX[0] * v[0] + AY[0] * v[1] + AZ[0] * v[2],
    AX[1] * v[0] + AY[1] * v[1] + AZ[1] * v[2],
    AX[2] * v[0] + AY[2] * v[1] + AZ[2] * v[2],
  ];

  // ── Left-stick orbit, session-scoped, 0 at session start ────────────────
  // Applied as A' = A · R with R = Ryaw · Rpitch (right-multiply: rotate the
  // XR-space vector by R first, then through the frozen anchor A). Since the
  // per-eye position term below is an offset from E_XR (Earth's XR-space
  // pin), rotating that offset orbits the view about Earth's centre — Earth
  // itself never moves; the world visibly spins around it.
  let orbitYawRad = 0;
  let orbitPitchRad = 0;
  const rotOrbited = (v: Vec3): Vec3 => rot(rotateAboutY(rotateAboutX(v, orbitPitchRad), orbitYawRad));

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
  let lastFrameTimeMs: number | null = null;

  diag.length = 0;
  pushDiag(`layer: ${layer.textureWidth}x${layer.textureHeight} colorFormat=${colorFormat} swapFormat=${swapFormat}`);
  let diagFramesLeft = 1;

  session.addEventListener('end', () => {
    vrOverride.active = false;
    vrOverride.eyes = [];
    frameDeps.canvas.width = savedCanvas.w;
    frameDeps.canvas.height = savedCanvas.h;
    state.subsystems.scheduler.requestRender();
    showDiag();
  });

  const onXRFrame = (time: number, frame: XRFrameish): void => {
    if (!vrOverride.active) return;
    session.requestAnimationFrame(onXRFrame);
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    // Thumbstick zoom: rescale metersToMpc about earthCenterWorld/E_XR — Earth
    // stays pinned 1.75 m ahead of the session-start origin while its
    // apparent size changes, since every eyeWorld below is an offset from
    // that fixed pin scaled by metersToMpc.
    const dtSeconds = lastFrameTimeMs === null ? null : Math.min((time - lastFrameTimeMs) / 1000, 0.1);
    lastFrameTimeMs = time;
    if (dtSeconds !== null) {
      const rightStick = readStickAxes(session, 'right');
      if (Math.abs(rightStick.y) > STICK_DEADZONE) {
        metersToMpc *= Math.exp(ZOOM_RATE * rightStick.y * dtSeconds);
        metersToMpc = Math.min(metersToMpcMax, Math.max(metersToMpcMin, metersToMpc));
      }

      // Left-stick orbit: X = yaw (circle around the globe), Y = pitch
      // (forward tilts the viewpoint up and over it — flip here if that
      // reads inverted on-device).
      const leftStick = readStickAxes(session, 'left');
      if (Math.abs(leftStick.x) > STICK_DEADZONE) {
        orbitYawRad += ORBIT_RATE * leftStick.x * dtSeconds;
      }
      if (Math.abs(leftStick.y) > STICK_DEADZONE) {
        orbitPitchRad = Math.min(
          ORBIT_PITCH_LIMIT_RAD,
          Math.max(-ORBIT_PITCH_LIMIT_RAD, orbitPitchRad + ORBIT_RATE * -leftStick.y * dtSeconds),
        );
      }
    }

    // Read fresh every XR frame (not cached) — Earth barely moves frame to
    // frame, but a stale copy would drift from the tile/label passes reading
    // the live snapshot the same instant via sceneBodyStates.
    const earthCenterWorld = deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current).get(
      earthBody.id,
    )!.positionMpc;

    const eyes: VrEye[] = [];
    const eyeCaptures: EyeCapture[] = [];
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
      // Rotate through the left-stick orbit R then the (session-frozen)
      // anchor into world space: v_world = A' · v_xr = A · (R · v_xr).
      // Position offsets from Earth's target 'local'-space point E_XR, not
      // from the reference-space origin, so ep === E_XR maps to
      // eyeWorld === earthCenterWorld regardless of orbit.
      const X = rotOrbited(ex);
      const Y = rotOrbited(ey);
      const Z = rotOrbited(ez);
      const off = rotOrbited([ep[0] - E_XR[0], ep[1] - E_XR[1], ep[2] - E_XR[2]]);
      const eyeWorld: Vec3 = [
        earthCenterWorld[0] + metersToMpc * off[0],
        earthCenterWorld[1] + metersToMpc * off[1],
        earthCenterWorld[2] + metersToMpc * off[2],
      ];

      const tan = tangentsOf(view.projectionMatrix);
      if (diagFramesLeft > 0) {
        // WebIDL dictionary fields don't enumerate — JSON.stringify(vd) prints
        // "{}" for most of these. Read each one explicitly.
        const vdRaw = sub.getViewDescriptor() as GPUTextureViewDescriptor & Record<string, unknown>;
        eyeCaptures.push({
          ep,
          vd: {
            dimension: vdRaw.dimension,
            format: vdRaw.format,
            baseArrayLayer: vdRaw.baseArrayLayer,
            arrayLayerCount: vdRaw.arrayLayerCount,
            baseMipLevel: vdRaw.baseMipLevel,
            mipLevelCount: vdRaw.mipLevelCount,
            aspect: vdRaw.aspect,
          },
          texWidth: sub.colorTexture.width,
          texHeight: sub.colorTexture.height,
          texLayers: sub.colorTexture.depthOrArrayLayers,
          viewport: { x: sub.viewport.x, y: sub.viewport.y, width: sub.viewport.width, height: sub.viewport.height },
          proj: view.projectionMatrix,
          m,
          tan,
          eyeWorld,
        });
      }
      eyes.push({
        viewCosmo: viewFromBasis(new Float32Array(16), X, Y, Z, eyeWorld),
        viewNear0: viewFromBasisOriginRelative(X, Y, Z, eyeWorld),
        tan,
        camPos: eyeWorld,
        textureView: sub.colorTexture.createView(sub.getViewDescriptor()),
      });
    }

    if (diagFramesLeft > 0) {
      const earthApparentRadiusM = EARTH_RADIUS_MPC / metersToMpc;
      // eyeCaptures is non-empty here: the same diagFramesLeft>0 condition
      // gated its population in the loop above.
      const e0ep = eyeCaptures[0]!.ep;
      const headToEarthCenterM = Math.hypot(
        e0ep[0] - E_XR[0],
        e0ep[1] - E_XR[1],
        e0ep[2] - E_XR[2],
      );
      pushDiag(
        `metersToMpc=${metersToMpc.toExponential(3)} earthApparentRadiusM=${earthApparentRadiusM.toFixed(4)} headToEarthCenterM=${headToEarthCenterM.toFixed(4)}`,
      );
      const { summary, body } = buildFrameDiagnostics(
        eyeCaptures,
        metersToMpc,
        earthApparentRadiusM,
        headToEarthCenterM,
      );
      pushDiag(...body);
      console.log(`[vrSpike-diag] ${summary}`);
      diag.unshift(summary);
      diagFramesLeft -= 1;
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
