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
 * ### The three id-bearing arms and their concrete replacements
 *
 *   - `moveTargetId(id, over, ease)` → `moveTarget(target, over, ease)`
 *     The target Vec3 comes from `focusFraming(row, fovYRad).target`.
 *
 *   - `dollyToId(id, over, ease)`   → `dollyTo(distance, over, ease)`
 *     The distance in Mpc comes from `focusFraming(row, fovYRad).distance`.
 *
 *   - `focusId(id)` or `focusId(null)` → `{ kind: 'focus', ref }`
 *     `null` maps to `{ kind: 'focus', ref: null }`.  A non-null id resolves
 *     through `resolveFocusId` to a `SelectionRef`.  There is no `focus()`
 *     helper that builds the resolved arm — `focus()` in `effectHelpers.ts`
 *     builds the UNRESOLVED `kind:'focusId'` arm.
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
 * single `child`. All other arms (`hold`, `wait`, scalar camera actions, scene
 * effects) pass through unchanged — they carry no focus ids to resolve.
 * `FocusBoundEffect` arms can only appear as leaf nodes (the type system
 * prevents them from carrying sub-children), so the walk is safe to pass
 * through any non-FocusBound leaf unchanged.
 */

import type { ClipData } from '../../../@types/animation/ClipData';
import type { Effect } from '../../../@types/animation/Effect';
import type { ResolveDeps } from '../../../@types/engine/ResolveDeps';
import type { SceneEffect } from '../../../@types/animation/SceneEffect';
import { moveTarget, dollyTo } from './effectHelpers';
import { resolveFocusId } from '../../url/resolveFocusId';
import { extractSelectionRow } from '../helpers/extractSelectionRow';
import { focusFraming } from '../camera/focusFraming';

/**
 * Rewrite every `moveTargetId` / `dollyToId` / `focusId` leaf in `data` to
 * its concrete equivalent, given the live catalog state in `deps` and the
 * camera's current vertical FOV in radians.
 *
 * Returns a new `ClipData` with the same structure but id-bearing leaves
 * replaced. The `start` field is preserved unchanged (that rewrite is
 * `resolveClipStart`'s responsibility).
 *
 * Throws if any non-null id fails to resolve — callers must ensure the
 * readiness gate has cleared before calling this.
 */
export function resolveClipFoci(data: ClipData, deps: ResolveDeps, fovYRad: number): ClipData {
  return { ...data, timeline: data.timeline.map((e) => walkEffect(e, deps, fovYRad)) };
}

// ─── Walk ────────────────────────────────────────────────────────────────────

/**
 * Recursively rewrite one `Effect` node.
 *
 * Structural nodes (`seq`, `all`, `fork`) recurse into their children.
 * Id-bearing leaves are rewritten. Everything else passes through as-is.
 */
function walkEffect(effect: Effect, deps: ResolveDeps, fovYRad: number): Effect {
  switch (effect.kind) {
    // ── Structural nodes — recurse ──────────────────────────────────────────
    case 'seq':
      return { kind: 'seq', children: effect.children.map((c) => walkEffect(c, deps, fovYRad)) };
    case 'all':
      return { kind: 'all', children: effect.children.map((c) => walkEffect(c, deps, fovYRad)) };
    case 'fork':
      return { kind: 'fork', child: walkEffect(effect.child, deps, fovYRad) };

    // ── Id-bearing leaves — rewrite ─────────────────────────────────────────
    case 'moveTargetId': {
      const { target } = resolveFraming(effect.id, deps, fovYRad);
      return moveTarget(target, effect.over, effect.ease);
    }
    case 'dollyToId': {
      const { distance } = resolveFraming(effect.id, deps, fovYRad);
      return dollyTo(distance, effect.over, effect.ease);
    }
    // ── flyPath — resolve each id-bearing waypoint; pass at-form through ──────
    //
    // The path-level pacing (`align` / `rampSec` / `linger` / `spline` /
    // `turnDelay`) carries through UNCHANGED. Dropping it here would silently
    // strip the helper's pacing defaults on normal playback (compileClip would
    // see undefined), which only the inspector masked by re-injecting via
    // applyPathTuning.
    case 'flyPath': {
      const waypoints = effect.waypoints.map((w) => {
        if (!('id' in w)) return w; // already concrete
        const { target, distance } = resolveFraming(w.id, deps, fovYRad);
        return {
          at: target,
          distance,
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
        ...(effect.spline !== undefined ? { spline: effect.spline } : {}),
        ...(effect.turnDelay !== undefined ? { turnDelay: effect.turnDelay } : {}),
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
