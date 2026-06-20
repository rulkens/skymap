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
 *   dwell    11–15 s Drift further in on the surviving members (ring framing →
 *                    close framing) with a slow yaw + pitch bob.
 *   galaxy   15–20 s Dive from the cluster framing down to M87 (Virgo A, the
 *                    central giant elliptical) — log-dolly to its focus
 *                    distance so the curated thumbnail quad resolves. Virgo
 *                    stays focused, so M87 (a member) holds bright while the
 *                    rest of the sky stays dimmed.
 *   hold     20–23 s Slow orbit on M87, then release.
 *
 * ### Why the galaxy beat keeps Virgo focused (doesn't focus M87)
 *
 * Focus is the structure-isolation source of truth, and a *galaxy* focus
 * cancels it (no radius → the dim fades out). So the final beat drives the
 * camera to M87 directly and leaves the focused slot on Virgo — the isolation
 * persists and M87, a member, stays bright. The thumbnail resolves on close
 * approach (apparent size, not selection), so no select call is needed.
 *
 * ### Why the driver owns the focus call (not a real click)
 *
 * Isolation is part of the CHOREOGRAPHY — it must land on a cue, framed and
 * timed — so the same object that runs the clock fires it. The member-isolation
 * fade keys off the focused slot in the selection slice, the deliberate gesture
 * a double-click uses; the driver dispatches `updateSelectionFocus` with Virgo's
 * structure ref directly rather than synthesising a pointer event. The
 * selectionRows saga reconciles that ref into the focused StructureInfo the
 * fade reads. The dispatch also kicks the focus-tween saga, but this driver
 * sits at priority 80 and owns the camera, so that tween never applies.
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
import type { Vec3 } from '../../../@types/math/Vec3';
import { Source } from '../../../data/sources';
import { updatePosition, clampDistance } from '../../camera/orbitCamera';
import { structureFocusDistance } from './structureFocusDistance';
import { galaxyFocusDistance } from './galaxyFocusDistance';
// Scene toggles are plain settings-slice actions (PR #352 dissolved the
// `handles/setX` setters into reconcile sagas). The driver dispatches; the
// sagas fire the side effects the old setters did.
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../state/settings/settingsSlice';
// Focus is the identity-Intent ref in the selection slice (PR #350 folded the
// old selection subsystem into the RTK store). Dispatching the structure ref is
// what the selectionRows saga reconciles into the focused StructureInfo that
// drives the member-isolation fade — the same write a double-click makes.
import { updateSelectionFocus } from '../../../state/selection/selectionSlice';

/**
 * Store id of the Virgo Cluster. The structure store keys anchors as
 * `${category}-${seed.id}` (buildStaticAnchorStructures), so the seed's
 * `virgo-m87` becomes `cluster-virgo-m87`.
 */
const VIRGO_ID = 'cluster-virgo-m87';

/** Famous-galaxy sidecar id of M87 (Virgo A) — the final dive target. */
const M87_ID = 'm87';

// ── Beat durations (seconds) ──────────────────────────────────────────
const PREROLL_SEC = 2; // static start pose after `g` — time to hit record
const PAN_SEC = 6; // orbit the neighbourhood, rings + labels sweep through
const APPROACH_SEC = 5; // ease target → Virgo + dolly in to frame its ring
const DWELL_SEC = 4; // drift in on the isolated members
const GALAXY_SEC = 5; // dive from the cluster framing down to M87
const GHOLD_SEC = 3; // slow orbit on the M87 thumbnail, then release

const T_PAN_END = PAN_SEC; // 6
const T_APPROACH_END = T_PAN_END + APPROACH_SEC; // 11
const T_DWELL_END = T_APPROACH_END + DWELL_SEC; // 15
const T_GALAXY_END = T_DWELL_END + GALAXY_SEC; // 20
const T_END = T_GALAXY_END + GHOLD_SEC; // 23

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
 * Build the named-cosmic-web sequencer. `state` supplies the structure +
 * galaxy stores; `store` sets the clean scene and dispatches the focus ref;
 * `requestRender` wakes a sleeping loop on `g`; `panMpc` is the opening orbit
 * distance.
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

  // M87's world position + framing distance, resolved on `g`. null → skip the
  // galaxy dive (hold on the isolated members instead).
  let m87Pos: Vec3 | null = null;
  let logDgalaxy = logDpan;

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

        // Resolve M87 for the final dive straight from the famous catalog —
        // its interleaved world position + angular diameter. Absent (catalog
        // not loaded, or id unknown) → m87Pos stays null and the galaxy beat
        // holds on the members instead of diving.
        const famous = state.data.galaxies.get(Source.FamousGalaxy);
        const m87Idx = state.data.galaxies.famousMeta.findIndex((m) => m.id === M87_ID);
        if (famous && m87Idx >= 0) {
          const p = famous.positions;
          m87Pos = [p[m87Idx * 3], p[m87Idx * 3 + 1], p[m87Idx * 3 + 2]];
          logDgalaxy = Math.log(clampDistance(galaxyFocusDistance(famous.diameterKpc[m87Idx])));
        } else {
          m87Pos = null;
          logDgalaxy = logDclose;
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

      // ── Target: Milky Way → Virgo across the approach (held through the
      // dwell), then Virgo → M87 across the galaxy dive. The camera looks at
      // `target`, so lerping it is what centres each subject — no yaw
      // alignment needed. M87 sits at Virgo's core, so the dive is mostly a
      // dolly: the target barely moves while the distance collapses. ──
      if (virgo !== null) {
        const vp = virgo.worldPos;
        if (tAnim < T_DWELL_END || m87Pos === null) {
          // origin → Virgo (eased), then held at Virgo through the dwell.
          const l =
            tAnim < T_PAN_END
              ? 0
              : tAnim < T_APPROACH_END
                ? easeInOutCubic((tAnim - T_PAN_END) / APPROACH_SEC)
                : 1;
          cam.target[0] = vp[0] * l;
          cam.target[1] = vp[1] * l;
          cam.target[2] = vp[2] * l;
        } else {
          // Virgo → M87 (eased), then held at M87.
          const l =
            tAnim < T_GALAXY_END ? easeInOutCubic((tAnim - T_DWELL_END) / GALAXY_SEC) : 1;
          cam.target[0] = vp[0] + (m87Pos[0] - vp[0]) * l;
          cam.target[1] = vp[1] + (m87Pos[1] - vp[1]) * l;
          cam.target[2] = vp[2] + (m87Pos[2] - vp[2]) * l;
        }
      }

      // ── Distance: log-dolly through the framing waypoints — pan distance →
      // Virgo ring (approach) → close cluster framing (dwell) → M87 focus
      // distance (galaxy dive) — each segment eased. Each waypoint is a log of
      // a clamped distance, so exp() interpolates geometrically (constant
      // zoom-rate feel across the orders of magnitude from 160 Mpc to ~0.3). ──
      let logD = logDpan;
      if (tAnim < T_PAN_END) {
        logD = logDpan;
      } else if (tAnim < T_APPROACH_END) {
        const e = easeInOutCubic((tAnim - T_PAN_END) / APPROACH_SEC);
        logD = logDpan + (logDring - logDpan) * e;
      } else if (tAnim < T_DWELL_END) {
        const e = easeInOutCubic((tAnim - T_APPROACH_END) / DWELL_SEC);
        logD = logDring + (logDclose - logDring) * e;
      } else if (tAnim < T_GALAXY_END) {
        const e = easeInOutCubic((tAnim - T_DWELL_END) / GALAXY_SEC);
        logD = logDclose + (logDgalaxy - logDclose) * e;
      } else {
        logD = logDgalaxy;
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
        store.dispatch(updateSelectionFocus({ type: 'structure', id: VIRGO_ID }));
      }

      // Release control once the timeline ends. The isolate stays latched
      // (reload to reset before the next take).
      if (tAnim >= T_END) phase = 'idle';
    },
  };
}
