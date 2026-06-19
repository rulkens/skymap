/**
 * webShowcaseDriver — THROWAWAY SPIKE (branch worktree-fly-to-edge-spike).
 *
 * The "named cosmic web" hero clip — a deterministic timeline for the
 * social post: pan across the wedge while cluster / supercluster / void
 * labels read, then "click a ring" to isolate one structure's members.
 *
 *   setup (page load, `?webshow`)  Volumes + filaments OFF and famous-galaxy
 *                                  labels OFF, so the frame is galaxy points +
 *                                  structure rings + their names — the labelled
 *                                  cosmic web, nothing else.
 *   pre-roll  (2 s)  After `g`, the camera holds the opening pose, static — a
 *                    window to start the screen recorder. Times below are
 *                    measured from the END of the pre-roll.
 *   pan      0–6 s   Slow orbit of the local structure neighbourhood. The ring
 *                    + label markers of Virgo, Coma, Perseus-Pisces… sweep
 *                    through frame (the establishing "named web" beat).
 *   approach 6–11 s  Ease the orbit TARGET from the Milky Way out to Virgo and
 *                    log-dolly in, framing Virgo's ring (factor 1.8 keeps the
 *                    ring just visible rather than past its close-approach
 *                    fade-out).
 *   click    +0.8 s  Settle on the ring, beat, then FOCUS Virgo — the same
 *                    gesture a double-click fires. Non-member galaxies fade to
 *                    ~8% over 400 ms; Virgo's members stay bright.
 *   hold     11–17 s Drift further in on the surviving members (ring framing →
 *                    close framing) with a slow yaw + pitch bob, so the
 *                    isolated cluster fills the frame. Then release.
 *
 * ### Why the driver owns the focus call (not a real click)
 *
 * Isolation is part of the CHOREOGRAPHY — it must land on a cue, framed and
 * timed — so the same object that runs the clock fires it. The member-isolation
 * fade keys off the engine's *focused* slot (`selection.setFocused`), the
 * deliberate gesture a double-click uses; the driver calls that setter directly
 * with the resolved Virgo record rather than synthesising a pointer event.
 *
 * NOTE (selection→Intent-store refactor, PR #350): when that lands, focus
 * becomes a store dispatch and this one `setFocused` line retargets to
 * `store.dispatch(...)`. Single isolated seam; the rest of the driver is
 * unaffected.
 *
 * ### Scene setup the user still does
 *
 *   - Press `h` (home) to centre the orbit on the Milky Way.
 *   - Ensure structure labels are on (default), `Tab` to hide UI, then `g`.
 *
 * Members stay isolated after a take; reload between takes. `?webshow=<mpc>`
 * overrides the opening pan distance. Attached only when `?webshow` is present.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AppStore } from '../../../store/types';
import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import { updatePosition, clampDistance } from '../../camera/orbitCamera';
import { structureFocusDistance } from './structureFocusDistance';
// Scene toggles are plain settings-slice actions (PR #352 dissolved the
// `handles/setX` setters into reconcile sagas). The driver dispatches; the
// sagas fire the side effects the old setters did.
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../state/settings/settingsSlice';

/** Featured-anchor id of the Virgo Cluster (data/seeds/structure_anchors.seed.json). */
const VIRGO_ID = 'virgo-m87';

// ── Beat durations (seconds) ──────────────────────────────────────────
const PREROLL_SEC = 2; // static start pose after `g` — time to hit record
const PAN_SEC = 6; // orbit the neighbourhood, rings + labels sweep through
const APPROACH_SEC = 5; // ease target → Virgo + dolly in to frame its ring
const HOLD_SEC = 6; // drift in on the isolated members, then release

const T_PAN_END = PAN_SEC; // 6
const T_APPROACH_END = T_PAN_END + APPROACH_SEC; // 11
const T_HOLD_END = T_APPROACH_END + HOLD_SEC; // 17
const T_END = T_HOLD_END; // 17

/** Beat after the approach settles before the isolate fires — the "click". */
const CLICK_DELAY_SEC = 0.8;
const T_CLICK = T_APPROACH_END + CLICK_DELAY_SEC; // 11.8

/**
 * Opening orbit distance, Mpc — frames the local structure neighbourhood
 * (Virgo ~16 Mpc, Coma ~90 Mpc) so several named rings + labels share the
 * wedge. Override with `?webshow=<mpc>`.
 */
const DEFAULT_PAN_MPC = 160;

/**
 * Ring-framing factor on `structureFocusDistance`. That helper frames a
 * structure so its ring has *just* faded out; >1 backs off so the ring is
 * still visible at the moment of the isolate — the "click a ring" read.
 */
const RING_FRAMING_FACTOR = 1.8;

/** Close-framing factor — the hold drifts in to here on the isolated members. */
const CLOSE_FRAMING_FACTOR = 0.9;

/** Slow rotation rate, rad/s (~50 s per revolution) — a gentle parallax pan. */
const ROT_RATE_RAD_S = 0.12;
/** Seconds the rotation eases IN from a standstill at the start of a take. */
const ROT_EASE_IN_SEC = 1.5;

/**
 * Opening pose. The orbit sits on the Milky Way (origin target) looking across
 * the local structures; the approach lerps the target out to Virgo, and since
 * the camera always looks at `target`, Virgo centres itself — no yaw whip.
 */
const START_TARGET: readonly [number, number, number] = [0, 0, 0];
const START_YAW = 0.6;
const START_PITCH = 0.26;
const START_FOV_Y_RAD = 1.0472;

/** Pitch bob — a slow sine on top of the framing pitch for a touch of life. */
const PITCH_AMP_RAD = 0.05;
const PITCH_PERIOD_SEC = 18;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function smoothstep01(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

type Phase = 'idle' | 'armed' | 'running';

/**
 * Build the named-cosmic-web sequencer. `state` supplies the structure store +
 * selection slot; `store` lets it set the clean scene; `requestRender` wakes a
 * sleeping loop on `g`; `panMpc` is the opening orbit distance.
 */
export function createWebShowcaseDriver(
  state: EngineState,
  store: AppStore,
  requestRender: () => void,
  panMpc: number = DEFAULT_PAN_MPC,
): CameraDriver {
  let phase: Phase = 'idle';
  let startMs = 0;
  let lastMs = 0;
  let yawAccum = 0;
  let firedFocus = false;

  // Resolved on `g` (anchors load synchronously during wiring, but resolving
  // at arm-time avoids any construction-order assumption). null → run the
  // camera move with no isolate.
  let virgo: StructureInfo | null = null;
  let logDpan = Math.log(clampDistance(panMpc));
  let logDring = logDpan;
  let logDclose = logDpan;

  // Clean scene, set once at page load: cosmic-web masters (volumes +
  // filaments) and famous-galaxy labels off, so the establishing view is the
  // galaxies + structure rings + their names.
  store.dispatch(setVolumesEnabled(false));
  store.dispatch(setFilamentsEnabled(false));
  store.dispatch(setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }));

  // `g` toggles: idle → start a take; running → abort (reload to clear the
  // isolate before the next take).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      phase = phase === 'idle' ? 'armed' : 'idle';
      requestRender();
    }
  });

  return {
    id: 'web-showcase-spike',
    priority: 80,
    isActive: () => phase !== 'idle',
    apply: (cam: OrbitCamera, nowMs: number) => {
      // ── Beat 0: snap to the opening pose, latch the clock, resolve Virgo
      // and its framing distances against the live FOV. ──
      if (phase === 'armed') {
        cam.target[0] = START_TARGET[0];
        cam.target[1] = START_TARGET[1];
        cam.target[2] = START_TARGET[2];
        cam.distance = clampDistance(panMpc);
        cam.yaw = START_YAW;
        cam.pitch = START_PITCH;
        cam.fovYRad = START_FOV_Y_RAD;

        startMs = nowMs;
        lastMs = nowMs;
        yawAccum = 0;
        firedFocus = false;

        virgo = state.data.structures.byId(VIRGO_ID);
        logDpan = Math.log(clampDistance(panMpc));
        if (virgo !== null) {
          const r = virgo.apparentRadiusMpc ?? virgo.physicalRadiusMpc;
          const dFocus = structureFocusDistance(r, cam.fovYRad);
          logDring = Math.log(clampDistance(dFocus * RING_FRAMING_FACTOR));
          logDclose = Math.log(clampDistance(dFocus * CLOSE_FRAMING_FACTOR));
        } else {
          // No Virgo record → stay at the pan distance (camera move only).
          logDring = logDpan;
          logDclose = logDpan;
        }
        phase = 'running';
      }

      const t = (nowMs - startMs) / 1000;
      const dt = (nowMs - lastMs) / 1000;
      lastMs = nowMs;

      // Static PRE-ROLL: `tAnim < 0` holds the opening pose (rotation eases
      // from 0, distance/target sit at the start). Every branch keys off it,
      // so the pre-roll needs no special-casing.
      const tAnim = t - PREROLL_SEC;

      // ── Rotation: ease IN from a standstill, then cruise. Integrated
      // per-frame so the easing applies to the angular VELOCITY. ──
      const omega =
        tAnim < ROT_EASE_IN_SEC
          ? ROT_RATE_RAD_S * smoothstep01(tAnim / ROT_EASE_IN_SEC)
          : ROT_RATE_RAD_S;
      yawAccum += omega * dt;
      cam.yaw = START_YAW + yawAccum;

      // ── Target: hold on the Milky Way through the pan, then ease out to
      // Virgo across the approach. The camera looks at `target`, so this is
      // what centres Virgo — no yaw alignment needed. Holds at Virgo there-
      // after. ──
      let targetLerp = 0;
      if (tAnim >= T_PAN_END && tAnim < T_APPROACH_END) {
        targetLerp = easeInOutCubic((tAnim - T_PAN_END) / APPROACH_SEC);
      } else if (tAnim >= T_APPROACH_END) {
        targetLerp = 1;
      }
      if (virgo !== null) {
        cam.target[0] = virgo.worldPos[0] * targetLerp;
        cam.target[1] = virgo.worldPos[1] * targetLerp;
        cam.target[2] = virgo.worldPos[2] * targetLerp;
      }

      // ── Distance: hold the pan distance, log-dolly to the ring framing
      // across the approach, then keep drifting in to the close framing
      // through the hold (members fill the frame as the field dims). ──
      let logD = logDpan;
      if (tAnim < T_PAN_END) {
        logD = logDpan;
      } else if (tAnim < T_APPROACH_END) {
        const e = easeInOutCubic((tAnim - T_PAN_END) / APPROACH_SEC);
        logD = logDpan + (logDring - logDpan) * e;
      } else if (tAnim < T_HOLD_END) {
        const e = easeInOutCubic((tAnim - T_APPROACH_END) / HOLD_SEC);
        logD = logDring + (logDclose - logDring) * e;
      } else {
        logD = logDclose;
      }
      cam.distance = clampDistance(Math.exp(logD));

      // ── Pitch bob: a slow sine on top of the framing pitch. The arg is
      // floored at 0 so the bob starts cleanly from zero at the first frame. ──
      const tBob = Math.max(0, tAnim);
      cam.pitch = START_PITCH + PITCH_AMP_RAD * Math.sin((2 * Math.PI * tBob) / PITCH_PERIOD_SEC);

      updatePosition(cam);

      // ── The "click": focus Virgo once, after the approach settles. The
      // shader dims non-members to ~8% over 400 ms off this focused slot. ──
      if (!firedFocus && tAnim >= T_CLICK && virgo !== null) {
        firedFocus = true;
        state.subsystems.selection.setFocused(virgo);
      }

      // Release control once the timeline ends. The isolate stays latched
      // (reload to reset before the next take).
      if (tAnim >= T_END) phase = 'idle';
    },
  };
}
