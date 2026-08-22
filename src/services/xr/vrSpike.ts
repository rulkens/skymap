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
 * World mapping: world-fixed active focus. The active focus's centre (Mpc) is
 * placed at a fixed point in XR 'local' space — 1.75 m in front of the
 * session-start head pose, at head height — scaled so it reads at its preset
 * apparent radius (metersToMpc = focus.radiusMpc / focus.apparentRadiusM).
 * The session-start focus is the flat app's live 2D view (whatever it was
 * centred/framed on when "Enter VR" was pressed), falling back to Earth only
 * if the 2D distance is unusable; see `focusCurrentView` below. The anchor
 * rotation basis is captured ONCE at session start (not reassembled per
 * frame): freezing it is what makes the virtual world rigid so the user can
 * walk around the focus, at the cost of orbit-camera rotation (tweens, drag)
 * no longer steering the VR view — fine for the spike. Position still comes
 * from the focus's live centre each frame (a followed body keeps moving; the
 * other presets are constants), so rotation freezes while translation
 * doesn't.
 *
 * Focus navigation: the right controller's A/B and left controller's X/Y
 * face buttons (xr-standard buttons[4]/[5]) tween (center, metersToMpc) to
 * Earth / Milky Way / local universe / deep universe over ~2 s, log-lerping
 * scale and smoothstep-easing both; see the `VrFocus` presets below. No
 * button tweens back to the session-start view — it is a one-time landing
 * spot, not a fifth preset.
 *
 * Known spike caveats (accepted, not bugs to fix here): labels project with
 * the mono orbit vp (render at infinity), pick/UI are dead in-session, the
 * canvas swap chain idles while the session runs.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { RunFrameDeps } from '../../@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../@types/math/Vec3';
import { runFrame } from '../engine/frame/runFrame';
import { setPassDisabled } from '../../state/settings/settingsSlice';
import { assembleOrbitCamera } from '../engine/camera/assembleOrbitCamera';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { imagePlaneBasis } from '../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../utils/camera/frameUp';
import { deriveBodyStates } from '../engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../data/scaleUnits';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_DISC_RADIUS_KPC,
} from '../../data/milkyWay/galacticCenter';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { HORIZON_RADIUS_GPC } from '../gpu/renderers/horizonShell/horizonShellRenderer';
import { lerp } from '../../utils/math/lerp';
import { lerpVec3 } from '../../utils/math/lerpVec3';
import { smoothstep } from '../../utils/math/smoothstep';
import { cross3 } from '../../utils/math/cross3';
import { normalize3 } from '../../utils/math/normalize3';
import { vrOverride, tangentsOf, viewFromBasis, viewFromBasisOriginRelative } from './vrSpikeState';
import type { VrEye, EyeTangents } from './vrSpikeState';

/** Earth's apparent radius inside the headset, metres (user request: ~1.5 m tall globe). */
const EARTH_RADIUS_TARGET_M = 0.75;
/** Head → focus-centre distance in XR 'local' space, metres — same pin for every focus preset. */
const HEAD_TO_EARTH_CENTER_M = 1.75;
/** The active focus's target position in 'local' space: straight ahead of the session-start head, at head height. */
const E_XR: Vec3 = [0, 0, -HEAD_TO_EARTH_CENTER_M];

// ── Thumbsticks: right = zoom, left = orbit ────────────────────────────────
/** Ignore stick noise below this magnitude (xr-standard axes rest near 0 but rarely at exactly 0). */
const STICK_DEADZONE = 0.15;
/** Full deflection ≈ 3 doublings/halvings of metersToMpc per second — full Earth→universe sweep ≈ 20 s. */
const ZOOM_RATE = 3 * Math.LN2;
/** Full deflection ≈ 1.2 rad/s of orbit yaw/pitch. */
const ORBIT_RATE = 1.2;
/** Pitch clamp — beyond this the view flips past the focus's poles. */
const ORBIT_PITCH_LIMIT_RAD = 1.5;
/** Focus-button navigation: time to tween (center, metersToMpc) to the pressed preset. */
const FOCUS_TWEEN_DURATION_MS = 2000;

/**
 * Label2D swap-target passes disabled only for the DURATION of a VR session
 * (set on session start, un-set on session end) — not at boot, unlike the
 * selection-ring passes in initialState.ts's `?vr` branch. Their
 * `ReadyFrameContext`-keyed projections (`cosmoLabelProjection.ts` /
 * `near0LabelProjection.ts`) would otherwise serve one eye's vp to both.
 * `produceVrLabels` (Label3D, drawn by `labels3dLayer`) replaces the COSMO
 * pair's content in-headset.
 */
const VR_SESSION_DISABLED_PASSES = ['labels', 'marker-lines', 'foreground-labels'] as const;

type StickAxes = { x: number; y: number };

/**
 * The `handedness` controller's xr-standard gamepad, falling back to any
 * xr-standard gamepad found — lets a single-controller test session still
 * drive every axis/button read (matches the original zoom-only fallback).
 */
function findXrGamepad(session: XRSessionish, handedness: 'left' | 'right'): XRGamepadish | null {
  let matched: XRGamepadish | null = null;
  let any: XRGamepadish | null = null;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp || gp.mapping !== 'xr-standard') continue;
    if (any === null) any = gp;
    if (src.handedness === handedness) {
      matched = gp;
      break;
    }
  }
  return matched ?? any;
}

/**
 * One controller's thumbstick {x, y}, xr-standard gamepad mapping (axes[2..3];
 * 2-axis pads with no touchpad expose the thumbstick at axes[0..1]).
 */
function readStickAxes(session: XRSessionish, handedness: 'left' | 'right'): StickAxes {
  const gp = findXrGamepad(session, handedness);
  if (!gp) return { x: 0, y: 0 };
  const fourAxis = gp.axes.length >= 4;
  const x = fourAxis ? gp.axes[2] : gp.axes[0];
  const y = fourAxis ? gp.axes[3] : gp.axes[1];
  return x === undefined || y === undefined ? { x: 0, y: 0 } : { x, y };
}

/** xr-standard face button: index 4 = A/X, index 5 = B/Y, per controller handedness. */
function readFaceButtonPressed(
  session: XRSessionish,
  handedness: 'left' | 'right',
  buttonIndex: number,
): boolean {
  return findXrGamepad(session, handedness)?.buttons[buttonIndex]?.pressed ?? false;
}

/**
 * `v` with its component along unit `axis` removed — `v` projected onto the
 * plane through the origin perpendicular to `axis`.
 */
function rejectAlong(v: Readonly<Vec3>, axis: Readonly<Vec3>): Vec3 {
  const d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  return [v[0] - axis[0] * d, v[1] - axis[1] * d, v[2] - axis[2] * d];
}

/**
 * An arbitrary unit vector perpendicular to `axis` — last-ditch fallback when
 * neither the anchor's forward nor its right axis has a usable horizontal
 * component (looking exactly along `axis`, e.g. straight along a pole with no
 * roll to fall back on). Picks whichever of world +Y/+X is least parallel to
 * `axis` so the projection below is never near-degenerate itself.
 */
function referenceHorizontal(axis: Readonly<Vec3>): Vec3 {
  const helper: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize3(rejectAlong(helper, axis));
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
  buttons: ArrayLike<{ pressed: boolean }>;
};
type XRInputSourceish = {
  handedness: string;
  gamepad: XRGamepadish | null | undefined;
};

/**
 * A focus-button navigation target: a named point the VR view can tween to.
 * `centerWorldMpc` is a function rather than a plain Vec3 so a live-tracked
 * focus (Earth) reads its current position every call while a static focus
 * (Milky Way, universe scales) just closes over a constant.
 */
type VrFocus = {
  label: string;
  centerWorldMpc: () => Readonly<Vec3>;
  /** Physical radius this focus is framed at, Mpc. */
  radiusMpc: number;
  /** Apparent radius the framing targets inside the headset, metres. */
  apparentRadiusM: number;
};

/**
 * An in-flight tween from the state (center, metersToMpc) captured at
 * `startTimeMs` toward `toFocus`. `fromCenter`/`fromLogScale` are a snapshot,
 * not re-read — that's what makes "restart mid-tween" well-defined: the next
 * button press snapshots wherever the interpolation currently sits.
 */
type VrTween = {
  fromCenter: Readonly<Vec3>;
  fromLogScale: number;
  toFocus: VrFocus;
  startTimeMs: number;
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
// First-frame per-eye raw numbers, console.log'd at capture time (one line
// per call, `[vrSpike-diag]`-prefixed) so `adb logcat` picks them up live —
// Chromium mirrors console output to logcat, the only way to see these
// numbers on-device without a tethered devtools session.
function pushDiag(...lines: string[]): void {
  for (const line of lines) console.log(`[vrSpike-diag] ${line}`);
}

const f3 = (v: ArrayLike<number>): string =>
  Array.from(v as number[], (x) =>
    Math.abs(x) < 1e-4 && x !== 0 ? x.toExponential(2) : x.toFixed(4),
  ).join(', ');

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
  focusApparentRadiusM: number,
  targetApparentRadiusM: number,
  focusLabel: string,
  headToFocusCenterM: number,
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
    check(
      Math.abs(e.ep[1]) < 0.15,
      `eye${i} ep.y magnitude`,
      `actual=${e.ep[1].toFixed(4)} expected<0.15`,
    );
    check(
      Math.abs(e.ep[2]) < 0.15,
      `eye${i} ep.z magnitude`,
      `actual=${e.ep[2].toFixed(4)} expected<0.15`,
    );

    const alc = e.vd.arrayLayerCount;
    check(
      alc === 1 || alc === undefined,
      `eye${i} arrayLayerCount`,
      `actual=${String(alc)} expected=1 or undefined`,
    );

    check(
      e.texLayers >= 2,
      `eye${i} colorTexture.depthOrArrayLayers`,
      `actual=${e.texLayers} expected>=2` +
        (e.texLayers >= 2
          ? ''
          : ' — not a texture-array — side-by-side layout, spike assumption broken'),
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
        (vpOk
          ? ''
          : ' — partial viewport — side-by-side layout, spike renders full-texture and this breaks'),
    );

    const p = e.proj;
    const colMajorOk = Math.abs(p[11]! + 1) < 1e-3;
    if (colMajorOk) {
      check(
        true,
        `eye${i} projectionMatrix p[11]`,
        `actual=${p[11]!.toFixed(4)} expected=-1 (column-major)`,
      );
    } else if (Math.abs(p[14]! + 1) < 1e-3) {
      check(
        false,
        `eye${i} projectionMatrix layout`,
        `p[11]=${p[11]!.toFixed(4)} p[14]=${p[14]!.toFixed(4)} — projection matrix appears ROW-major/transposed — tangent decomposition reads garbage`,
      );
    } else {
      check(false, `eye${i} projectionMatrix p[11]`, `actual=${p[11]!.toFixed(4)} expected=-1`);
    }
    check(
      Math.abs(p[15]!) < 1e-3,
      `eye${i} projectionMatrix p[15]`,
      `actual=${p[15]!.toFixed(4)} expected~0`,
    );
    check(
      Math.abs(p[3]!) < 1e-3,
      `eye${i} projectionMatrix p[3]`,
      `actual=${p[3]!.toFixed(4)} expected~0`,
    );
    check(
      Math.abs(p[7]!) < 1e-3,
      `eye${i} projectionMatrix p[7]`,
      `actual=${p[7]!.toFixed(4)} expected~0`,
    );

    check(
      e.tan.l < 0 && 0 < e.tan.r,
      `eye${i} tangents l<0<r`,
      `actual l=${e.tan.l.toFixed(4)} r=${e.tan.r.toFixed(4)}`,
    );
    check(
      e.tan.d < 0 && 0 < e.tan.u,
      `eye${i} tangents d<0<u`,
      `actual d=${e.tan.d.toFixed(4)} u=${e.tan.u.toFixed(4)}`,
    );
  });

  if (eyeCaptures.length === 2) {
    const [e0, e1] = eyeCaptures as [EyeCapture, EyeCapture];

    const orderOk = e0.ep[0] < 0 && e1.ep[0] > 0;
    const swapped = e0.ep[0] > 0 && e1.ep[0] < 0;
    check(
      orderOk,
      'eye order (ep.x sign)',
      `actual=(${e0.ep[0].toFixed(4)}, ${e1.ep[0].toFixed(4)}) expected=(negative, positive)` +
        (swapped
          ? ' — eye order swapped'
          : orderOk
            ? ''
            : ' — neither eye matches the expected sign'),
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
      e0.tan.l === e1.tan.l &&
      e0.tan.r === e1.tan.r &&
      e0.tan.d === e1.tan.d &&
      e0.tan.u === e1.tan.u;
    check(
      !identicalFrusta,
      'eyes have distinct frusta',
      identicalFrusta
        ? 'eyes have identical frusta — asymmetry lost'
        : 'left/right tangents differ',
    );

    const sepWorld = Math.hypot(
      e0.eyeWorld[0] - e1.eyeWorld[0],
      e0.eyeWorld[1] - e1.eyeWorld[1],
      e0.eyeWorld[2] - e1.eyeWorld[2],
    );
    const sepMeters = sepWorld / metersToMpc;
    check(
      sepWorld > 0,
      'eyeWorld positions differ',
      `actual separation=${sepWorld.toExponential(3)} world units`,
    );
    check(
      sepMeters >= 0.02 && sepMeters <= 0.12,
      'eyeWorld separation ≈ IPD',
      `actual=${sepMeters.toFixed(4)} m expected≈0.055..0.075 m (bounds 0.02..0.12)`,
    );
  }

  check(
    Number.isFinite(metersToMpc) && metersToMpc > 0,
    'metersToMpc finite>0',
    `actual=${metersToMpc}`,
  );
  // Generic across every focus preset (including the session-start "current
  // view" one, whose radiusMpc/apparentRadiusM aren't Earth's) — each preset
  // defines its own target apparent radius, so this checks the SAME focus's
  // own math rather than hardcoding Earth's 0.75 m expectation.
  check(
    Math.abs(focusApparentRadiusM - targetApparentRadiusM) < 1e-6,
    `${focusLabel} apparent radius = target`,
    `actual=${focusApparentRadiusM.toFixed(4)} m expected=${targetApparentRadiusM} m`,
  );
  check(
    Math.abs(headToFocusCenterM - HEAD_TO_EARTH_CENTER_M) < 0.05,
    'head→focus-centre distance ≈ target',
    `actual=${headToFocusCenterM.toFixed(4)} m expected≈${HEAD_TO_EARTH_CENTER_M} m`,
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
    rawDumps.push(
      `eye${i} projectionMatrix: ${f3(e.proj)}`,
      `eye${i} transform matrix m: ${f3(e.m)}`,
    );
  });

  return {
    summary: offCount === 0 ? 'VR DIAG: all checks OK' : `VR DIAG: ${offCount} checks OFF`,
    body: [...checks, ...eyeBlocks, ...rawDumps],
  };
}

export function installVrSpike(state: EngineState, frameDeps: RunFrameDeps): void {
  const xr = (
    navigator as unknown as {
      xr?: { requestSession(mode: string, init?: unknown): Promise<XRSessionish> };
    }
  ).xr;
  const XRGPUBindingCtor = (
    window as unknown as { XRGPUBinding?: new (s: XRSessionish, d: GPUDevice) => XRGPUBindingish }
  ).XRGPUBinding;
  if (!xr || !XRGPUBindingCtor) {
    console.warn(
      '[vrSpike] navigator.xr or XRGPUBinding missing — enable "WebXR experimental features" in chrome://flags',
    );
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
    startSession(state, frameDeps, xr, XRGPUBindingCtor, button).catch((e: unknown) => {
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
  button: HTMLButtonElement,
): Promise<void> {
  const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['webgpu'] });
  const binding = new XRGPUBindingCtor(session, frameDeps.device);

  const colorFormat = binding.getPreferredColorFormat();
  const swapFormat = state.gpu.renderTargets?.specOf('swap').format;
  if (swapFormat !== undefined && swapFormat !== colorFormat) {
    // Overlay pipelines were baked against the canvas swap format at init;
    // a mismatch here renders garbage or validation-errors every frame.
    console.warn(
      `[vrSpike] XR layer format ${colorFormat} != swap format ${swapFormat} — expect validation errors`,
    );
  }

  const earthBody = state.data.bodies.earth;
  if (earthBody === null) {
    console.warn('[vrSpike] no Earth body seeded — nothing to anchor the VR session on');
    return;
  }
  // Earth-radius-derived world scale (session-start constant — Earth's radius
  // doesn't change at runtime, unlike the old orbit-distance-derived scale).
  const EARTH_RADIUS_MPC = earthBody.radiusKm * SCALE_UNITS.KM_TO_MPC;

  // Absolute stick-zoom bounds on metersToMpc — independent of whichever
  // focus is active, so a preset tween never gets fought by a clamp sized
  // for a different preset. Floor: Earth's apparent radius ≤ ~2000 m.
  // Ceiling: the whole observable universe (HORIZON_RADIUS_GPC) fits within
  // half a meter.
  const METERS_TO_MPC_MIN = EARTH_RADIUS_MPC / 2000;
  const METERS_TO_MPC_MAX = (HORIZON_RADIUS_GPC * 1000) / 0.5;

  // ── Focus-button navigation presets ─────────────────────────────────────
  // Each preset's target metersToMpc = radiusMpc / apparentRadiusM, so every
  // focus fills the same fraction of the headset view its radius implies.
  const focusEarth: VrFocus = {
    label: 'Earth',
    // Live every call — Earth's position moves frame to frame, same read as
    // the pre-focus-preset version of this file.
    centerWorldMpc: () =>
      deriveBodyStates(state.cameraRuntime.lastRenderedSimDays.current).get(earthBody.id)!
        .positionMpc,
    radiusMpc: EARTH_RADIUS_MPC,
    apparentRadiusM: EARTH_RADIUS_TARGET_M,
  };
  const focusMilkyWay: VrFocus = {
    label: 'Milky Way',
    centerWorldMpc: () => MILKY_WAY_CENTER_WORLD,
    // MILKY_WAY_DISC_RADIUS_KPC (galacticCenter.ts) is the disc's real
    // physical radius — the same number the point-cloud model matrix and
    // pick target size from.
    radiusMpc: MILKY_WAY_DISC_RADIUS_KPC * SCALE_UNITS.KPC_TO_MPC,
    apparentRadiusM: 1.0,
  };
  const focusLocalUniverse: VrFocus = {
    label: 'Local universe',
    centerWorldMpc: () => RENDER_ORIGIN_MPC,
    radiusMpc: 10,
    apparentRadiusM: 1.0,
  };
  const focusDeepUniverse: VrFocus = {
    label: 'Deep universe',
    centerWorldMpc: () => RENDER_ORIGIN_MPC,
    // ~1/3 of the observable universe's comoving radius. HORIZON_RADIUS_GPC
    // (horizonShellRenderer.ts) is the real 14.3 Gpc = 14,300 Mpc constant
    // the horizon-shell impostor and "The edge" tour beat both size from.
    radiusMpc: (HORIZON_RADIUS_GPC * 1000) / 3,
    apparentRadiusM: 1.5,
  };

  // ── Session-start focus: wherever the 2D view already was ───────────────
  // "Enter VR" should land on the flat app's current view (a focused Saturn,
  // a followed body, an arbitrary pan) rather than always jumping to Earth.
  // `lastPose.current` is the same Resource the 2D camera reads via
  // `assembleOrbitCamera`, and `runFrame`'s step 4 rewrites it every frame
  // regardless of vrOverride — so closing over it (not copying `.target`
  // once) means a body-followed pivot keeps tracking after the headset goes
  // on. Scale is captured ONCE, from the 2D distance at session start:
  // metersToMpc = distance / HEAD_TO_EARTH_CENTER_M keeps the framed subject
  // at its 2D apparent size with the pin the same 1.75 m in front of the
  // head every preset uses.
  const startDistanceMpc = state.cameraRuntime.lastPose.current.distance;
  const focusCurrentView: VrFocus =
    Number.isFinite(startDistanceMpc) && startDistanceMpc > 0
      ? {
          label: 'Current view',
          centerWorldMpc: () => state.cameraRuntime.lastPose.current.target,
          radiusMpc: startDistanceMpc,
          apparentRadiusM: HEAD_TO_EARTH_CENTER_M,
        }
      : focusEarth; // sanity guard: a zero/non-finite distance can't scale — fall back to Earth.

  // Mutable: thumbstick zoom rescales this every frame; a focus-button tween
  // also rewrites it every frame while in flight (see onXRFrame below).
  let metersToMpc = focusCurrentView.radiusMpc / focusCurrentView.apparentRadiusM;
  let activeFocus: VrFocus = focusCurrentView;
  let tween: VrTween | null = null;
  // Edge-trigger state: fire navigation only on the false→true transition,
  // not every frame the button is held.
  let prevBtnA = false;
  let prevBtnB = false;
  let prevBtnX = false;
  let prevBtnY = false;
  // Edge-trigger on the combined both-squeezes condition (not per-button) so
  // holding both down after the first frame doesn't re-fire session.end().
  let prevBothSqueezes = false;

  const layer = binding.createProjectionLayer({ colorFormat, textureType: 'texture-array' });
  session.updateRenderState({ layers: [layer] });
  const refSpace = await session.requestReferenceSpace('local');

  // ── Anchor view direction, frozen once at session start ────────────────
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
  // World-space up the flat app's orbit camera zeniths on (its orientation
  // frame's pole) — every yaw/pitch below is measured about this one axis,
  // every frame, which is what makes the reconstructed orbit roll-free.
  const worldUp = frameUp(anchorCam.upBasis);

  // ── Roll-free spherical orbit frame ─────────────────────────────────────
  // An orbit camera never accumulates roll because it rebuilds view/up from
  // (yaw, pitch) about ONE fixed pole every frame — see updatePosition.ts +
  // imagePlaneBasis.ts. The bug this replaces instead composed two rotations
  // about DIFFERENT axes (yaw about worldUp, then pitch about the
  // session-frozen XR +X carried through the anchor basis): roll-free only
  // when those two axes happen to be perpendicular, which stops holding the
  // moment the anchor view itself is pitched/oblique. Fix: extract the
  // anchor's own heading/elevation about worldUp ONCE (below), then every
  // frame rebuild forward/right/up from (yaw0+yaw, pitch0+pitch) the same
  // way the flat camera does — `imagePlaneBasis(forward, 0, worldUp)` forces
  // right to `normalize(forward × worldUp)`, which is perpendicular to
  // worldUp for ANY forward, so the horizon can never tilt.
  //
  // yaw0 is folded into Z0 rather than stored separately: Z0 IS the anchor's
  // own (roll-discarded) heading direction, so "yaw = 0" already reproduces
  // it — pitch0 is the only angle that needs storing as a number.
  const pitch0 = Math.asin(
    Math.max(-1, Math.min(1, af[0] * worldUp[0] + af[1] * worldUp[1] + af[2] * worldUp[2])),
  );
  const HEADING_EPS = 1e-4;
  // Heading source, in priority order: the anchor forward's own horizontal
  // component (the normal case); else its roll-discarded right axis (still
  // well-defined when forward is near-vertical, since right ⊥ forward); else
  // an arbitrary horizontal axis unrelated to the view. The last two only
  // matter when |af·worldUp| ≈ 1 (e.g. entering VR looking straight down at
  // Earth) — right there pitch0 ≈ ±π/2 so cos(pitch0) ≈ 0 and yaw stops
  // affecting the reproduced direction anyway, making the exact fallback
  // choice harmless as long as it's finite (never NaN).
  const afHoriz = rejectAlong(af, worldUp);
  const afHorizLen = Math.hypot(afHoriz[0], afHoriz[1], afHoriz[2]);
  let heading: Vec3;
  if (afHorizLen >= HEADING_EPS) {
    heading = afHoriz;
  } else {
    const rightLevel = imagePlaneBasis(af, 0, worldUp).right;
    heading =
      Math.hypot(rightLevel[0], rightLevel[1], rightLevel[2]) >= HEADING_EPS
        ? rightLevel
        : referenceHorizontal(worldUp);
  }
  const Z0 = normalize3(heading);
  const X0 = cross3(worldUp, Z0);

  // ── Left-stick orbit, session-scoped, reset to 0 on every focus change ──
  let orbitYawRad = 0;
  let orbitPitchRad = 0;

  // Size the canvas backing store to the per-eye texture so renderTargets
  // reconciles the offscreen chain (HDR, bloom, half-res upsamples) to XR
  // resolution through the normal path. runFrame's resize guard is off while
  // the override is active, so nothing fights this.
  frameDeps.canvas.width = Math.max(1, layer.textureWidth);
  frameDeps.canvas.height = Math.max(1, layer.textureHeight);

  vrOverride.active = true;
  vrOverride.eyes = [];
  let warnedViewport = false;
  let lastFrameTimeMs: number | null = null;

  for (const pass of VR_SESSION_DISABLED_PASSES) {
    frameDeps.cb.store.dispatch(setPassDisabled({ pass, disabled: true }));
  }

  pushDiag(
    `layer: ${layer.textureWidth}x${layer.textureHeight} colorFormat=${colorFormat} swapFormat=${swapFormat}`,
  );
  let diagFramesLeft = 1;

  session.addEventListener('end', () => {
    vrOverride.active = false;
    vrOverride.eyes = [];
    // Restore exactly the keys this session added — never a blanket
    // `disabledPasses = {}`, which would clobber unrelated entries (e.g. the
    // selection-ring pair initialState.ts pre-disabled for the flat page).
    for (const pass of VR_SESSION_DISABLED_PASSES) {
      frameDeps.cb.store.dispatch(setPassDisabled({ pass, disabled: false }));
    }
    // Deliberately leave the canvas backing store at the eye-texture size —
    // the next non-VR runFrame's resizeCanvasToDisplay sees the mismatch
    // against clientWidth/Height and resizes AND refreshes
    // cameraRuntime.projection.aspect together. A hand-restore to the cached
    // pre-session size looked like "no change" to that guard and left aspect
    // stuck at the eye-texture ratio (the stretched-Earth bug).
    button.disabled = false;
    state.subsystems.scheduler.requestRender();
  });

  /**
   * Focus-button press: snapshot the current interpolated (center,
   * metersToMpc) as the tween's start and (re)tween to `focus` — restart-safe,
   * since re-calling mid-tween just re-snapshots wherever the interpolation
   * currently sits. Orbit resets to 0 because the pivot is about to move to a
   * different focus; carrying the old yaw/pitch would spin the new subject in
   * at an arbitrary angle instead of presenting it face-on.
   */
  const selectFocus = (
    focus: VrFocus,
    currentCenter: Readonly<Vec3>,
    currentMetersToMpc: number,
    nowMs: number,
  ): void => {
    tween = {
      fromCenter: [currentCenter[0], currentCenter[1], currentCenter[2]],
      fromLogScale: Math.log(currentMetersToMpc),
      toFocus: focus,
      startTimeMs: nowMs,
    };
    orbitYawRad = 0;
    orbitPitchRad = 0;
    console.log(`[vrSpike] focus → ${focus.label}`);
  };

  const onXRFrame = (time: number, frame: XRFrameish): void => {
    if (!vrOverride.active) return;
    session.requestAnimationFrame(onXRFrame);
    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    const dtSeconds =
      lastFrameTimeMs === null ? null : Math.min((time - lastFrameTimeMs) / 1000, 0.1);
    lastFrameTimeMs = time;

    // Resolve this frame's focus center + scale first — ages any in-flight
    // tween (log-lerping metersToMpc, smoothstep-eased) or reads the active
    // focus live — so the button check below both snapshots the right state
    // and this frame still renders from a consistent (center, scale) pair.
    let focusCenterWorld: Readonly<Vec3>;
    if (tween !== null) {
      const t = Math.min(1, (time - tween.startTimeMs) / FOCUS_TWEEN_DURATION_MS);
      const ease = smoothstep(0, 1, t);
      const toCenter = tween.toFocus.centerWorldMpc();
      const toLogScale = Math.log(tween.toFocus.radiusMpc / tween.toFocus.apparentRadiusM);
      focusCenterWorld = lerpVec3(tween.fromCenter, toCenter, ease);
      metersToMpc = Math.exp(lerp(tween.fromLogScale, toLogScale, ease));
      if (t >= 1) {
        activeFocus = tween.toFocus;
        tween = null;
      }
    } else {
      // Read fresh every XR frame (not cached) — Earth barely moves frame to
      // frame, but a stale copy would drift from the tile/label passes reading
      // the live snapshot the same instant via sceneBodyStates; static
      // presets just return their constant.
      focusCenterWorld = activeFocus.centerWorldMpc();
    }

    // Thumbstick zoom: rescale metersToMpc about focusCenterWorld/E_XR — the
    // active focus stays pinned 1.75 m ahead of the session-start origin
    // while its apparent size changes, since every eyeWorld below is an
    // offset from that fixed pin scaled by metersToMpc. Suppressed mid-tween:
    // the tween owns metersToMpc while it runs.
    if (dtSeconds !== null) {
      const rightStick = readStickAxes(session, 'right');
      if (tween === null && Math.abs(rightStick.y) > STICK_DEADZONE) {
        // Signed square: light pulls give fine control, full deflection (|y|=1) still hits ZOOM_RATE.
        const curved = rightStick.y * Math.abs(rightStick.y);
        metersToMpc *= Math.exp(ZOOM_RATE * curved * dtSeconds);
        metersToMpc = Math.min(METERS_TO_MPC_MAX, Math.max(METERS_TO_MPC_MIN, metersToMpc));
      }

      // Left-stick orbit: X = yaw about worldUp (circle around the globe —
      // intent is stick-right orbits the view right, world appears to turn
      // left; flip the sign here if that reads backwards on-device, same
      // as the pitch note below), Y = pitch (forward tilts the viewpoint up
      // and over it — flip here if that reads inverted on-device). Keeps
      // working through a tween.
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

    // Face buttons → focus navigation (A/B right controller, X/Y left —
    // xr-standard buttons[4]/[5]). Edge-triggered so a held button fires the
    // tween once, not every frame it stays down.
    const btnA = readFaceButtonPressed(session, 'right', 4);
    const btnB = readFaceButtonPressed(session, 'right', 5);
    const btnX = readFaceButtonPressed(session, 'left', 4);
    const btnY = readFaceButtonPressed(session, 'left', 5);
    if (btnA && !prevBtnA) selectFocus(focusEarth, focusCenterWorld, metersToMpc, time);
    if (btnB && !prevBtnB) selectFocus(focusMilkyWay, focusCenterWorld, metersToMpc, time);
    if (btnX && !prevBtnX) selectFocus(focusLocalUniverse, focusCenterWorld, metersToMpc, time);
    if (btnY && !prevBtnY) selectFocus(focusDeepUniverse, focusCenterWorld, metersToMpc, time);
    prevBtnA = btnA;
    prevBtnB = btnB;
    prevBtnX = btnX;
    prevBtnY = btnY;

    // In-VR exit gesture: both middle-finger squeeze/grip buttons at once ends
    // the session — the Quest system menu can't always dismiss the immersive
    // view. xr-standard squeeze/grip is buttons[1]; the 'end' listener above
    // does the teardown (canvas restore, vrOverride reset).
    const squeezeL = readFaceButtonPressed(session, 'left', 1);
    const squeezeR = readFaceButtonPressed(session, 'right', 1);
    const bothSqueezes = squeezeL && squeezeR;
    if (bothSqueezes && !prevBothSqueezes) {
      console.log('[vrSpike] dual-squeeze exit');
      session.end().catch((e: unknown) => console.error('[vrSpike] session.end failed', e));
    }
    prevBothSqueezes = bothSqueezes;

    // Roll-free orbit basis for this frame — rebuilt from (yaw0+yaw,
    // pitch0+pitch) about worldUp every frame (see the setup-time comment
    // above), not composed from the previous frame's basis, so error can't
    // accumulate and no yaw/pitch combination can tilt the horizon.
    const orbitPitch = pitch0 + orbitPitchRad;
    const cosOrbitPitch = Math.cos(orbitPitch);
    const sinOrbitPitch = Math.sin(orbitPitch);
    const cosOrbitYaw = Math.cos(orbitYawRad);
    const sinOrbitYaw = Math.sin(orbitYawRad);
    const orbitForward: Vec3 = [
      X0[0] * cosOrbitPitch * sinOrbitYaw +
        worldUp[0] * sinOrbitPitch +
        Z0[0] * cosOrbitPitch * cosOrbitYaw,
      X0[1] * cosOrbitPitch * sinOrbitYaw +
        worldUp[1] * sinOrbitPitch +
        Z0[1] * cosOrbitPitch * cosOrbitYaw,
      X0[2] * cosOrbitPitch * sinOrbitYaw +
        worldUp[2] * sinOrbitPitch +
        Z0[2] * cosOrbitPitch * cosOrbitYaw,
    ];
    const orbitBasis = imagePlaneBasis(orbitForward, 0, worldUp);
    const OX = orbitBasis.right;
    const OY = orbitBasis.up;
    const OZ: Vec3 = [-orbitForward[0], -orbitForward[1], -orbitForward[2]];
    // Rotates an XR-local vector (x→right, y→up, z→backward) into world
    // space through this frame's basis — the position offset below rotates
    // the same way, orbiting the view about the focus's pinned centre.
    const rotOrbited = (v: Vec3): Vec3 => [
      OX[0] * v[0] + OY[0] * v[1] + OZ[0] * v[2],
      OX[1] * v[0] + OY[1] * v[1] + OZ[1] * v[2],
      OX[2] * v[0] + OY[2] * v[1] + OZ[2] * v[2],
    ];

    const eyes: VrEye[] = [];
    const eyeCaptures: EyeCapture[] = [];
    for (const view of pose.views) {
      const sub = binding.getViewSubImage(layer, view);
      if (!warnedViewport && (sub.viewport.x !== 0 || sub.viewport.y !== 0)) {
        console.warn(
          '[vrSpike] non-zero subimage viewport — side-by-side layout unsupported by the spike',
        );
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
      // Position offsets from the active focus's pinned 'local'-space point
      // E_XR, not from the reference-space origin, so ep === E_XR maps to
      // eyeWorld === focusCenterWorld regardless of orbit.
      const X = rotOrbited(ex);
      const Y = rotOrbited(ey);
      const Z = rotOrbited(ez);
      const off = rotOrbited([ep[0] - E_XR[0], ep[1] - E_XR[1], ep[2] - E_XR[2]]);
      const eyeWorld: Vec3 = [
        focusCenterWorld[0] + metersToMpc * off[0],
        focusCenterWorld[1] + metersToMpc * off[1],
        focusCenterWorld[2] + metersToMpc * off[2],
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
          viewport: {
            x: sub.viewport.x,
            y: sub.viewport.y,
            width: sub.viewport.width,
            height: sub.viewport.height,
          },
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
      // Generic over whichever focus is active on frame 1 (the session-start
      // "current view" preset, or its Earth fallback) — see buildFrameDiagnostics.
      const focusApparentRadiusM = activeFocus.radiusMpc / metersToMpc;
      // eyeCaptures is non-empty here: the same diagFramesLeft>0 condition
      // gated its population in the loop above.
      const e0ep = eyeCaptures[0]!.ep;
      const headToFocusCenterM = Math.hypot(
        e0ep[0] - E_XR[0],
        e0ep[1] - E_XR[1],
        e0ep[2] - E_XR[2],
      );
      pushDiag(
        `focus=${activeFocus.label} metersToMpc=${metersToMpc.toExponential(3)} focusApparentRadiusM=${focusApparentRadiusM.toFixed(4)} headToFocusCenterM=${headToFocusCenterM.toFixed(4)}`,
      );
      const { summary, body } = buildFrameDiagnostics(
        eyeCaptures,
        metersToMpc,
        focusApparentRadiusM,
        activeFocus.apparentRadiusM,
        activeFocus.label,
        headToFocusCenterM,
      );
      pushDiag(...body);
      console.log(`[vrSpike-diag] ${summary}`);
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
