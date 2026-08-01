/**
 * resolveClipFoci — a pure rewrite pass that replaces every id-bearing
 * `FocusBoundEffect` in a `ClipData` with its concrete equivalent, BEFORE
 * `compileClip` runs.
 *
 * ### Why a separate pre-pass instead of resolving inside compileClip?
 *
 * `compileClip` is a structural compiler: it flattens the timeline tree into
 * per-channel tracks. Mixing focus resolution into that pass would give it two
 * responsibilities — understanding the timeline structure AND knowing how to
 * look up catalog data. Separating them keeps each function narrow and
 * independently testable. This mirrors the pattern set by `resolveClipStart`
 * in `cameraSlice.ts`, which rewrites `'live'` starts before any compilation
 * happens.
 *
 * ### The id-bearing arms and their concrete replacements
 *
 *   - `moveTargetId(id, over, ease)` → `moveTarget(target, over, ease)`
 *     The target Vec3 comes from `focusFraming(row, fovYRad).target`.
 *
 *   - `dollyToId(id, over, ease)`   → `dollyTo(distance, over, ease)`
 *     The distance in Mpc comes from `focusFraming(row, fovYRad).distance`.
 *
 *   - `lookAtId(id, over, ease)`    → `aimAt({ yaw, pitch }, over, ease)`
 *     The bearing aims the view from the LIVE orbit target (`from.target`,
 *     passed by the caller from the camera runtime) at the subject's framed
 *     position. Because the bearing is baked here — at resolve time — a
 *     `lookAtId` is only correct before anything else moves the target; see
 *     the `lookAtId` helper's docstring.
 *
 *   - `strafeId(id, byDeg, over, ease)` → `moveTarget(displaced, over, ease)`
 *     The live orbit target displaced along the horizontal right axis of the
 *     bearing toward the subject, by `tan(byDeg) × from.distance` — an
 *     angular sidestep that reads the same at every scale. Same baked-at-
 *     resolve caveat as `lookAtId`.
 *
 *   - `spinToId(id, { over, turns, ease })` → `spin('yaw', { by, over, ease })`
 *     `by` is the SHORTEST signed arc from the live yaw to the subject's
 *     bearing (through `frameBasis`, same as `lookAtId`), plus `turns` full
 *     revolutions. Unlike `lookAtId` it writes only yaw — pitch/target/
 *     distance are untouched — so it composes with `dwellDrift`'s pitch bob.
 *     The primitive this whole task adds: a bearing stored as a world
 *     sightline instead of a frame-local radian constant.
 *
 *   - `focusId(id)` or `focusId(null)` → `{ kind: 'focus', ref }`
 *     `null` maps to `{ kind: 'focus', ref: null }`.  A non-null id resolves
 *     through `resolveFocusId` to a `SelectionRef`.  There is no `focus()`
 *     helper that builds the resolved arm — `focus()` in `effectHelpers.ts`
 *     builds the UNRESOLVED `kind:'focusId'` arm.
 *
 *   - `aimAlong(forward, over, ease)` → `aimAt({ yaw, pitch }, over, ease)`
 *     Same `orbitAnglesLookingAlong(forward, frameBasis)` encode as `lookAtId`,
 *     but `forward` is an authored WORLD vector, not a subject id — no target
 *     lookup, no dependency on `from` at all. Not a `FocusBoundEffect` (it
 *     carries no `FocusId`), but still unresolved until this pass runs; see
 *     the `aimAlong` helper's docstring for why `lookAtId` cannot substitute.
 *
 * ### Why throw on a null resolution instead of silently dropping?
 *
 * The readiness gate (Task 5 `clipFociReady`) guarantees every id resolves
 * before this function is called. A null here means the gate is broken or the
 * clip was dispatched without the gate — a programmer error, not a graceful
 * degradation opportunity. A clear thrown message pinpoints the culprit
 * without confusing the caller with a partially-resolved clip.
 *
 * ### Walk invariants
 *
 * `seq` / `all` recurse into their `children` arrays; `fork` recurses into its
 * single `child`. `FocusBoundEffect` arms and `aimAlong` are rewritten as
 * above. Every other arm (`hold`, `wait`, scalar camera actions, scene
 * effects) passes through unchanged — it carries nothing this pass resolves.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import { moveTarget, dollyTo, aimAt, spin } from './effectHelpers';
import { resolveFocusId } from '../../url/resolveFocusId';
import { extractSelectionRow } from '../helpers/extractSelectionRow';
import { focusFraming } from '../camera/focusFraming';
import { orbitAnglesLookingAlong } from '../../../utils/camera/orbitAnglesLookingAlong';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { lerpAngleShortest } from '../../../utils/math/lerpAngleShortest';

/**
 * Rewrite every id-bearing leaf in `data` to its concrete equivalent, given
 * the live catalog state in `deps`, the camera's current vertical FOV in
 * radians, and the live camera pose (`lookAtId` bearings are measured from
 * its target; `strafeId` scales degrees into Mpc by its distance; `spinToId`
 * measures its bearing from the same target and its yaw delta from `from.yaw`
 * — callers pass `cameraRuntime.from`).
 *
 * `frameBasis` is the STEADY orientation-frame basis
 * (`ORIENTATION_FRAMES[settings.orientation]`) resolved at this clip boundary.
 * A `lookAtId` bearing is encoded through it so the aim decodes back to the
 * subject under the same frame the render path decodes with (see
 * `orbitAnglesLookingAlong`). Absent ⇒ identity (world-frame bearings), so every
 * non-engine caller and test is unchanged.
 *
 * Returns a new `ClipData` with the same structure but id-bearing leaves
 * replaced. The `start` field is preserved unchanged (that rewrite is
 * `resolveClipStart`'s responsibility).
 *
 * Throws if any non-null id fails to resolve — callers must ensure the
 * readiness gate has cleared before calling this.
 */
export function resolveClipFoci(
  data: ClipData,
  deps: ResolveDeps,
  fovYRad: number,
  from: CameraPose,
  frameBasis?: Mat3,
): ClipData {
  return {
    ...data,
    timeline: data.timeline.map((e) => walkEffect(e, deps, fovYRad, from, frameBasis)),
  };
}

// ─── Walk ────────────────────────────────────────────────────────────────────

/**
 * Recursively rewrite one `Effect` node.
 *
 * Structural nodes (`seq`, `all`, `fork`) recurse into their children.
 * Id-bearing leaves are rewritten. Everything else passes through as-is.
 */
function walkEffect(
  effect: Effect,
  deps: ResolveDeps,
  fovYRad: number,
  from: CameraPose,
  frameBasis?: Mat3,
): Effect {
  switch (effect.kind) {
    // ── Structural nodes — recurse ──────────────────────────────────────────
    case 'seq':
      return {
        kind: 'seq',
        children: effect.children.map((c) => walkEffect(c, deps, fovYRad, from, frameBasis)),
      };
    case 'all':
      return {
        kind: 'all',
        children: effect.children.map((c) => walkEffect(c, deps, fovYRad, from, frameBasis)),
      };
    case 'fork':
      return { kind: 'fork', child: walkEffect(effect.child, deps, fovYRad, from, frameBasis) };

    // ── Id-bearing leaves — rewrite ─────────────────────────────────────────
    case 'moveTargetId': {
      const { target } = resolveFraming(effect.id, deps, fovYRad);
      return moveTarget(target, effect.over, effect.ease);
    }
    case 'dollyToId': {
      const { distance } = resolveFraming(effect.id, deps, fovYRad);
      // `scale` multiplies the DERIVED framing distance — the author's
      // tighter/looser knob that survives framing-math and catalog changes.
      return dollyTo(distance * (effect.scale ?? 1), effect.over, effect.ease);
    }
    // The bearing that puts the subject centre-frame beyond the LIVE orbit
    // target — baked here, so a lookAtId is only valid before the target
    // moves (see the `lookAtId` helper docstring).
    case 'lookAtId': {
      const { target } = resolveFraming(effect.id, deps, fovYRad);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      return aimAt(orbitAnglesLookingAlong(forward, frameBasis), effect.over, effect.ease);
    }
    // A fixed world sightline, not a subject bearing: no target lookup, no
    // dependency on `from` at all — just the live `frameBasis`. This is what
    // makes it safe for a cold-open snap, where `from` is whatever pose the
    // camera happened to hold before the clip started (see the `aimAlong`
    // helper's docstring).
    case 'aimAlong': {
      return aimAt(orbitAnglesLookingAlong(effect.forward, frameBasis), effect.over, effect.ease);
    }
    // A lateral tracking move: displace the live orbit target along the
    // horizontal right axis of the bearing toward the subject. That axis is
    // the `right` of `imagePlaneBasis(forward, 0, frameUp(frameBasis))` — the
    // reference up is the frame pole (world +Y absent a basis). The strafe still
    // holds the target's world height fixed (see `displaced` below) and keys its
    // vertical-bearing guard off the world XZ magnitude — its long-standing
    // world-frame semantics, left intact. The angular `byDeg` scales into Mpc by
    // the live camera distance, so the anchor slides ~byDeg degrees across the
    // frame regardless of scale.
    case 'strafeId': {
      const { target } = resolveFraming(effect.id, deps, fovYRad);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      if (Math.hypot(forward[2], forward[0]) < 1e-12) {
        throw new Error(
          `resolveClipFoci: strafeId '${effect.id}' has a vertical bearing — ` +
            `no horizontal right axis exists to strafe along.`,
        );
      }
      const { right } = imagePlaneBasis(forward, 0, frameUp(frameBasis));
      const byMpc = Math.tan((effect.byDeg * Math.PI) / 180) * from.distance;
      const displaced: Vec3 = [
        from.target[0] + right[0] * byMpc,
        from.target[1],
        from.target[2] + right[2] * byMpc,
      ];
      return moveTarget(displaced, effect.over, effect.ease);
    }
    // A bearing is a world sightline, not a frame-local number: `by` is the
    // shortest signed arc from the LIVE yaw to the subject's bearing (through
    // `frameBasis`, same encode as `lookAtId`), so the same authored effect
    // lands on the same subject under any orientation frame. `turns` (default
    // 0) folds in extra whole revolutions on top of that shortest arc —
    // negative takes the long way round, matching the `- Math.PI * 2` idiom
    // `approachM31.ts`'s NET_YAW_RAD established for the same reason. Reusing
    // `lerpAngleShortest`'s fold (its result at t=1 IS `from.yaw` plus the
    // shortest delta) avoids re-deriving the mod-2π formula a second time.
    case 'spinToId': {
      const { target } = resolveFraming(effect.id, deps, fovYRad);
      const forward: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      const { yaw: bearingYaw } = orbitAnglesLookingAlong(forward, frameBasis);
      const shortest = lerpAngleShortest(from.yaw, bearingYaw, 1) - from.yaw;
      const by = shortest + (effect.turns ?? 0) * Math.PI * 2;
      return spin('yaw', { by, over: effect.over, ease: effect.ease });
    }
    // ── flyPath — resolve each id-bearing waypoint; pass at-form through ──────
    //
    // The path-level pacing (`align` / `rampSec` / `linger` / `lingerSec` /
    // `spline`, whose causalHermite arm carries `turnDelay` / `lookAhead`; plus
    // `passBy`) carries
    // through UNCHANGED. Dropping it here would silently strip the helper's pacing
    // defaults on normal playback (compileClip would see undefined), which only
    // the inspector masked by re-injecting via applyPathTuning. Each resolved
    // waypoint also gains its subject `radius` (the pass-by offset unit).
    case 'flyPath': {
      const waypoints = effect.waypoints.map((w) => {
        if (!('id' in w)) return w; // already concrete
        const { target, distance, radius } = resolveFraming(w.id, deps, fovYRad);
        return {
          at: target,
          distance,
          radius, // the subject extent a pass-by offset scales by
          ...(w.yaw !== undefined ? { yaw: w.yaw } : {}),
          ...(w.pitch !== undefined ? { pitch: w.pitch } : {}),
          ...(w.over !== undefined ? { over: w.over } : {}),
          ...(w.linger !== undefined ? { linger: w.linger } : {}),
        };
      });
      return {
        kind: 'flyPath',
        waypoints,
        over: effect.over,
        ease: effect.ease,
        ...(effect.align !== undefined ? { align: effect.align } : {}),
        ...(effect.rampSec !== undefined ? { rampSec: effect.rampSec } : {}),
        ...(effect.linger !== undefined ? { linger: effect.linger } : {}),
        ...(effect.lingerSec !== undefined ? { lingerSec: effect.lingerSec } : {}),
        ...(effect.spline !== undefined ? { spline: effect.spline } : {}),
        ...(effect.passBy !== undefined ? { passBy: effect.passBy } : {}),
      };
    }

    case 'focusId': {
      if (effect.id === null) {
        // Explicit focus-clear: resolves to a no-op focus cue.
        const focusClear: SceneEffect & { kind: 'focus' } = { kind: 'focus', ref: null };
        return focusClear;
      }
      const ref = resolveFocusId(effect.id, deps);
      if (ref === null) {
        throw new Error(
          `resolveClipFoci: could not resolve focusId '${effect.id}'. ` +
            `Ensure the readiness gate (clipFociReady) cleared before calling resolveClipFoci.`,
        );
      }
      const focusCue: SceneEffect & { kind: 'focus' } = { kind: 'focus', ref };
      return focusCue;
    }

    // ── Pass-through — camera actions, scene effects, hold/wait ────────────
    default:
      return effect;
  }
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

/**
 * Resolve a `FocusId` to a `{ target, distance }` framing pose.
 *
 * The chain is: `resolveFocusId` → `extractSelectionRow` → `focusFraming`.
 * Each step can return null only if the id is unknown or the catalog isn't
 * loaded; the readiness gate guarantees neither happens at call time, so a
 * null here is a programming error — we throw with a descriptive message.
 */
function resolveFraming(
  id: string,
  deps: ResolveDeps,
  fovYRad: number,
): ReturnType<typeof focusFraming> {
  const ref = resolveFocusId(id, deps);
  if (ref === null) {
    throw new Error(
      `resolveClipFoci: could not resolve id '${id}' to a SelectionRef. ` +
        `Ensure the readiness gate (clipFociReady) cleared before calling resolveClipFoci.`,
    );
  }
  const row = extractSelectionRow(ref, deps);
  if (row === null) {
    throw new Error(
      `resolveClipFoci: id '${id}' resolved to a ref but extractSelectionRow returned null. ` +
        `The catalog row may have unloaded between the readiness check and resolution.`,
    );
  }
  return focusFraming(row, fovYRad);
}
