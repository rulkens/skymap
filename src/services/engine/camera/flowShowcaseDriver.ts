/**
 * flowShowcaseDriver — THROWAWAY SPIKE (branch worktree-fly-to-edge-spike).
 *
 * The choreographed "cosmic flows" hero clip — a single deterministic
 * timeline that owns BOTH the camera and the scene/layer state:
 *
 *   setup (page load, `?flowshow`)  Cosmic web OFF, famous-galaxy labels
 *                                   OFF. Flow stays off → clean MW view.
 *   pre-roll  (2 s)  After `g`, the camera holds the opening pose, static —
 *                    a window to start the screen recorder. Times below are
 *                    measured from the END of the pre-roll.
 *   beat I   0–2 s   Rotate slowly on the Milky Way. Galaxies visible,
 *                    NO flow yet (a calm establishing intro).
 *   beat A   2–5 s   Flow field fades IN (3 s) while the galaxy points
 *                    fade OUT (3 s) — the cross-dissolve.
 *   beat B1  5–9 s   Pull back (log-dolly) to the Laniakea / Shapley scale,
 *                    easing to a near-stop.
 *   dwell    9–12 s  Slow down + dwell on the local flow basin.
 *   beat B2  12–16 s Speed up again out to the full field (ending slightly
 *                    zoomed IN so it fills the frame). Rotation decelerates
 *                    across the whole pull-back to a tiny residual drift.
 *   beat C   16–21 s Hold on the complete field for 5 s (subtle live drift +
 *                    pitch bob, not a freeze).
 *   beat D   21–24 s Everything left — flow, Milky Way, structure markers
 *                    and all labels — fades OUT together (3 s), ending on
 *                    black. Done.
 *
 * ### Why the driver owns the scene calls (not engine.ts)
 *
 * Visibility is part of the CHOREOGRAPHY — flow must appear a couple
 * seconds in, not at page load — so the same object that runs the clock
 * fires the enable/disable. Cosmic-web-off + famous-labels-off are static,
 * so they run once at construction; flow is enabled on `g` (so the cube
 * isn't loaded/shown until a take begins) and its OPACITY is driven on the
 * timeline. The driver gets the `settingsStore` to call the same setters
 * the UI uses (`setFlow`/`setVolumesEnabled`/…) — no settings poked raw.
 *
 * ### How layer opacity is timed
 *
 * Visibility is owned by the FadeRegistry: the flow pass multiplies by
 * `opacityOf({kind:'flow'})` and the galaxy draw mask reads
 * `opacityOf({kind:'galaxyCatalog', id})`. During beat I we hold the flow
 * at 0 every frame (`setImmediate`) so a just-loaded cube can't auto-fade
 * itself in early; at beat A we `fadeTo(1, 3 s)` and fade each catalog to
 * 0. The flow layer stays *enabled* throughout (cube resident, ribbons
 * advecting); only its opacity moves.
 *
 * ### Scene setup the user still does
 *
 *   - Press `h` (home) to center the orbit on the Milky Way.
 *   - Frame how close you want to start, `Tab` to hide UI, then `g`.
 *
 * Galaxies stay faded out after a take; reload between takes. First take in
 * a fresh session may briefly lag while the velocity cube fetches — `g`
 * once to warm it, then record. Attached only when `?flowshow` is present.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AppStore } from '../../../store/types';
import type { FadeId } from '../../../@types/animation/FadeId';
import { clampDistance } from '../../camera/orbitCamera';
import { GALAXY_CATALOG_IDS } from '../../../data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
// Scene toggles are plain settings-slice actions now (PR #352 dissolved the
// `handles/setX` setters into reconcile sagas). The driver dispatches; the
// sagas fire the side effects the old setters used to — requestRender,
// syncVisibilityFades, the flow reseed — so a bare dispatch is the whole call.
import {
  setFlow,
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../state/settings/settingsSlice';

// ── Beat durations (seconds) ──────────────────────────────────────────
const PREROLL_SEC = 2; // static start pose after `g` — time to hit record
const INTRO_SEC = 2; // rotate on MW, galaxies up, NO flow yet
const FADE_SEC = 3; // flow in + galaxies out (cross-dissolve)
const ZOOM1_SEC = 4; // pull back to the Laniakea / Shapley scale
const DWELL_SEC = 3; // slow down + dwell on the local flow fields
const ZOOM2_SEC = 4; // speed up again out to the full field
const HOLD_SEC = 5; // static hold on the complete field
const FADE_OUT_SEC = 3; // everything fades out

const T_FADE_START = INTRO_SEC; // 2
const T_FADE_END = T_FADE_START + FADE_SEC; // 5
const T_ZOOM1_END = T_FADE_END + ZOOM1_SEC; // 9   — arrive at the mid scale
const T_DWELL_END = T_ZOOM1_END + DWELL_SEC; // 12  — leave the mid scale
const T_ZOOM2_END = T_DWELL_END + ZOOM2_SEC; // 16  — arrive at the full field
const T_HOLD_END = T_ZOOM2_END + HOLD_SEC; // 21
const T_END = T_HOLD_END + FADE_OUT_SEC; // 24

/** Slow rotation rate, rad/s (~35 s per revolution). */
const ROT_RATE_RAD_S = 0.18;

/**
 * Seconds over which the rotation eases IN from a standstill at the start
 * of a take, so the camera accelerates smoothly into the cruise instead of
 * snapping to full speed on `g`. Kept under INTRO_SEC so it's up to speed
 * before the cross-dissolve.
 */
const ROT_EASE_IN_SEC = 1.5;

/**
 * Residual rotation, rad/s, that the deceleration eases DOWN to (rather
 * than to a dead stop) and holds through beat C + the fade-out — a barely-
 * there drift (~1 rev per 4 min) so the "pause" still has subtle parallax
 * on the field instead of freezing like a paused video. Set to 0 for a
 * true halt.
 */
const HOLD_RATE_RAD_S = 0.025;

/**
 * Gentle pitch bob — the "nice effect" from the flow-orbit driver. A slow
 * sine on top of the framing pitch (~5°, ~16 s period) so the camera
 * subtly rises and dips through the move, adding life + a touch of 3D
 * parallax. Amplitude 0 disables it.
 */
const PITCH_AMP_RAD = 0.09;
const PITCH_PERIOD_SEC = 16;

/**
 * Mid-zoom dwell distance, Mpc — the Laniakea / Shapley scale. The camera
 * slows to a near-stop here so the local flow basin reads before pulling
 * out to the whole field. (Laniakea ~160 Mpc across, Shapley ~200 Mpc out;
 * ~300 Mpc frames that neighbourhood with context.)
 */
const MID_DISTANCE_MPC = 300;

/**
 * Final framing distance, Mpc — the full field, slightly zoomed IN so it
 * fills the frame rather than sitting small with margin (the cube is
 * 1000 Mpc per edge / ~500 Mpc radius). Override with `?flowshow=<mpc>`.
 */
const DEFAULT_FAR_MPC = 950;

/**
 * Fixed opening pose, so every take starts from the same Milky-Way framing
 * (captured via the `l` hotkey). The driver snaps the camera here on `g` —
 * no manual framing needed.
 */
const START_TARGET: readonly [number, number, number] = [0, -0.01, 0];
const START_DISTANCE_MPC = 0.14;
const START_YAW = 4.44;
const START_PITCH = 0.2932;

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
 * Build the flow-showcase sequencer. `state` supplies the fade registry +
 * loaded catalog ids; `store` lets it call the scene-setup setters;
 * `requestRender` wakes a sleeping loop on `g`; `farMpc` is the pull-back
 * framing distance.
 */
export function createFlowShowcaseDriver(
  state: EngineState,
  store: AppStore,
  requestRender: () => void,
  farMpc: number = DEFAULT_FAR_MPC,
): CameraDriver {
  let phase: Phase = 'idle';
  let startMs = 0;
  let lastMs = 0;
  let yaw0 = 0;
  let yawAccum = 0;
  let pitch0 = 0;
  let logD0 = 0;
  const logDmid = Math.log(clampDistance(MID_DISTANCE_MPC));
  const logD1 = Math.log(clampDistance(farMpc));
  let firedFadeIn = false;
  let firedFadeOut = false;

  const fades = state.subsystems.fades;

  // Static scene, set once at page load: the cosmic-web masters (volumes +
  // filaments) and famous-galaxy labels off, so the establishing view is
  // just the galaxies + Milky Way. Flow is left OFF until a take starts.
  store.dispatch(setVolumesEnabled(false));
  store.dispatch(setFilamentsEnabled(false));
  store.dispatch(setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }));

  // `g` toggles: idle → start a take; running → abort (reload to reset the
  // scene before the next take, since galaxies stay faded out).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      phase = phase === 'idle' ? 'armed' : 'idle';
      requestRender();
    }
  });

  return {
    id: 'flow-showcase-spike',
    // Above the store movers (orbitDrag 80, tween 60, autoRotate 20) so the
    // scripted take owns the camera outright.
    priority: 90,
    isActive: () => phase !== 'idle',
    pose: (_s, _cam): CameraPose => {
      // Self-clocked: the driver-table elapsed clock only serves tween /
      // autoRotate, so this spike reads the wall clock itself.
      const nowMs = performance.now();

      // Working pose. The target stays fixed at the Milky-Way origin for the
      // whole take (the move is orbit + dolly, never a re-target), so it's
      // seeded once here and never rewritten. yaw / pitch / distance are
      // recomputed every frame below. fovYRad is no longer a pose field — the
      // opening framing uses the app's live projection FOV.
      const out: CameraPose = {
        target: [START_TARGET[0], START_TARGET[1], START_TARGET[2]],
        yaw: START_YAW,
        pitch: START_PITCH,
        distance: clampDistance(START_DISTANCE_MPC),
      };

      // ── Beat 0: latch the fixed opening pose, enable+hide the flow. The
      // running computation at t≈0 reproduces the opening pose (yaw0/pitch0/
      // logD0 are the START_* constants), so no explicit camera snap is needed
      // — every take is identical regardless of where the user left the camera. ──
      if (phase === 'armed') {
        startMs = nowMs;
        lastMs = nowMs;
        yaw0 = START_YAW;
        yawAccum = 0;
        pitch0 = START_PITCH;
        logD0 = Math.log(clampDistance(START_DISTANCE_MPC));
        firedFadeIn = false;
        firedFadeOut = false;
        phase = 'running';

        // Enable the flow (loads the cube if needed, keeps it advecting) but
        // clamp its opacity to 0 — beat A owns the visible fade-in. Intensity
        // is left at its default; only enable + opacity are choreographed.
        store.dispatch(setFlow({ enabled: true }));
        fades.setImmediate({ kind: 'flow' }, 0);
      }

      const t = (nowMs - startMs) / 1000;
      const dt = (nowMs - lastMs) / 1000;
      lastMs = nowMs;

      // The whole animation is shifted by a static PRE-ROLL: after `g` the
      // camera holds the opening pose for PREROLL_SEC (time to hit record)
      // before anything moves. `tAnim < 0` during the pre-roll, and every
      // timeline branch keys off it — rotation eases from 0 (smoothstep
      // clamps negatives), distance sits at the start (tAnim < T_FADE_END),
      // pitch holds flat (the sine arg is floored at 0), and the flow stays
      // hidden — so the pre-roll needs no special-casing.
      const tAnim = t - PREROLL_SEC;

      // ── Beat I: hold the flow hidden so a cube that lands mid-intro can't
      // auto-fade itself in before its cue (covers the pre-roll too). ──
      if (tAnim < T_FADE_START) {
        fades.setImmediate({ kind: 'flow' }, 0);
      }

      // ── Beat A cue: flow fades IN while galaxies fade OUT, once. ──
      if (!firedFadeIn && tAnim >= T_FADE_START) {
        firedFadeIn = true;
        fades.fadeTo({ kind: 'flow' }, 1, FADE_SEC * 1000);
        for (const id of GALAXY_CATALOG_IDS) {
          try {
            fades.fadeTo({ kind: 'galaxyCatalog', id }, 0, FADE_SEC * 1000);
          } catch {
            // Not loaded → not registered → nothing to fade. Skip.
          }
        }
      }

      // ── Rotation: ease IN from a standstill, cruise through the intro +
      // cross-dissolve, then decelerate across the WHOLE pull-back (zoom →
      // dwell → zoom) to a tiny residual drift that persists through the hold
      // (a subtle living pause, not a freeze). Integrated per-frame so the
      // easing applies to the angular VELOCITY. ──
      let omega = HOLD_RATE_RAD_S;
      if (tAnim < ROT_EASE_IN_SEC) {
        omega = ROT_RATE_RAD_S * smoothstep01(tAnim / ROT_EASE_IN_SEC);
      } else if (tAnim < T_FADE_END) {
        omega = ROT_RATE_RAD_S;
      } else if (tAnim < T_ZOOM2_END) {
        const k = smoothstep01((tAnim - T_FADE_END) / (T_ZOOM2_END - T_FADE_END));
        omega = ROT_RATE_RAD_S * (1 - k) + HOLD_RATE_RAD_S * k;
      }
      yawAccum += omega * dt;
      out.yaw = yaw0 + yawAccum;

      // ── Distance: hold close through the cross-dissolve, then a two-stage
      // log-dolly with a dwell in the middle — pull back to the Laniakea /
      // Shapley scale (easing to a near-stop), dwell there, then speed up
      // again out to the full field. The dwell IS the "slow down in the
      // middle"; each segment is eased so accel/decel are smooth. ──
      if (tAnim < T_FADE_END) {
        out.distance = clampDistance(Math.exp(logD0)); // close on the MW
      } else if (tAnim < T_ZOOM1_END) {
        const e = easeInOutCubic((tAnim - T_FADE_END) / ZOOM1_SEC);
        out.distance = clampDistance(Math.exp(logD0 + (logDmid - logD0) * e));
      } else if (tAnim < T_DWELL_END) {
        out.distance = clampDistance(Math.exp(logDmid)); // dwell: local flows
      } else if (tAnim < T_ZOOM2_END) {
        const e = easeInOutCubic((tAnim - T_DWELL_END) / ZOOM2_SEC);
        out.distance = clampDistance(Math.exp(logDmid + (logD1 - logDmid) * e));
      } else {
        out.distance = clampDistance(Math.exp(logD1)); // full field
      }

      // ── Pitch bob: a slow sine on top of the framing pitch (the flow-orbit
      // "nice effect") for a touch of life + vertical parallax. The sine arg
      // is floored at 0 so the pitch holds flat through the pre-roll and
      // starts the bob cleanly from zero at the animation's first frame. ──
      const tBob = Math.max(0, tAnim);
      out.pitch = pitch0 + PITCH_AMP_RAD * Math.sin((2 * Math.PI * tBob) / PITCH_PERIOD_SEC);

      // ── Beat D: fade EVERYTHING still on screen out together, once, after
      // the hold — flow, the Milky-Way impostor, every structure marker
      // (clusters/superclusters/voids/groups) and every label layer — so the
      // clip ends on black. Galaxy catalogs already faded at beat A. Each
      // fade is guarded: an unregistered id (layer never loaded) is a skip.
      if (!firedFadeOut && tAnim >= T_HOLD_END) {
        firedFadeOut = true;
        const endFadeIds: FadeId[] = [
          { kind: 'flow' },
          { kind: 'milkyWay' },
          { kind: 'labelLayer', layer: 'milkyWay' },
          { kind: 'labelLayer', layer: 'galaxyNames' },
          { kind: 'labelLayer', layer: 'scaleBar' },
          ...STRUCTURE_IDS.map((id): FadeId => ({ kind: 'structure', id })),
          ...STRUCTURE_IDS.map(
            (id): FadeId => ({ kind: 'labelLayer', layer: 'structure', category: id }),
          ),
        ];
        for (const fid of endFadeIds) {
          try {
            fades.fadeTo(fid, 0, FADE_OUT_SEC * 1000);
          } catch {
            // Layer not registered (never loaded) → nothing to fade. Skip.
          }
        }
      }

      // Release control once the timeline ends. The flow fade-out finishes
      // on its own — the registry keeps the loop awake while it animates.
      if (tAnim >= T_END) phase = 'idle';

      return out;
    },
  };
}
