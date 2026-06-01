/**
 * clusterFocusSubsystem — selection-driven cluster "focus mode".
 *
 * When a cluster / supercluster / void POI is the current selection,
 * non-member galaxies fade to ~8% alpha over ~400 ms (the shader does
 * the per-vertex membership test; this subsystem only supplies the
 * centre, radius, invert flag, and the smoothstep blend). See
 * `ClusterFocusSubsystem.d.ts` for the rationale (selection as single
 * source of truth; GPU re-derivation instead of a CPU member list).
 *
 * ### Why a `focusedId` separate from the display target
 *
 * `update` runs every frame with the live selection. Both the fade-in
 * and the fade-out must fire exactly once, on the transition — not every
 * frame. Re-calling `fade.fadeTo` each frame would reset the ramp's
 * clock and the blend would never advance. `focusedId` records the id we
 * are currently fading *toward* (null = fading out / at rest), so a
 * frame whose selection matches it is a true no-op.
 *
 * The display target (`active`) is kept latched through the fade-out so
 * `produceFocusUniforms` keeps emitting the correct centre/radius until
 * the blend reaches 0; only then is it dropped.
 */

import { createFadeController } from '../../animation/fadeController';
import type { ClusterFocusSubsystem } from '../../../@types/engine/subsystems/ClusterFocusSubsystem';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { Vec3 } from '../../../@types/math/Vec3';

/** Focus fade duration in ms (spec §3.4). */
export const FOCUS_FADE_DURATION_MS = 400;

/** At-rest sentinel: blend=0 makes the shader multiplier collapse to 1.0. */
const ZERO_FOCUS: FocusUniformsValue = {
  center: [0, 0, 0],
  radiusMpc: 0,
  blend: 0,
  invert: 0,
};

/** The latched display target while focus is active or fading out. */
type ActiveFocus = {
  readonly id: string;
  readonly center: Vec3;
  readonly radiusMpc: number;
  readonly invert: 0 | 1;
};

export function createClusterFocusSubsystem(
  initialNowMs: number = performance.now(),
): ClusterFocusSubsystem {
  const fade = createFadeController(0, initialNowMs);
  // The POI we emit centre/radius for. Latched through fade-out.
  let active: ActiveFocus | null = null;
  // The id we are currently fading toward; null = fading out / at rest.
  let focusedId: string | null = null;

  function update(poi: PointOfInterest | null, nowMs: number): void {
    // Narrow to a focus-eligible extended-structure POI. famousGalaxy has
    // no radius, so it (and null) drives a fade-out.
    let next: ActiveFocus | null = null;
    if (
      poi !== null &&
      (poi.category === 'cluster' ||
        poi.category === 'supercluster' ||
        poi.category === 'void')
    ) {
      next = {
        id: poi.id,
        center: [poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]],
        radiusMpc: poi.apparentRadiusMpc ?? poi.physicalRadiusMpc,
        invert: poi.category === 'void' ? 1 : 0,
      };
    }

    const targetId = next?.id ?? null;
    // No transition → no re-fade (covers same focused POI every frame AND
    // an already-in-flight fade-out being re-observed every frame).
    if (targetId === focusedId) return;

    focusedId = targetId;
    if (next !== null) {
      active = next;
      void fade.fadeTo(1, FOCUS_FADE_DURATION_MS, nowMs);
    } else {
      // Keep `active` latched so the shader keeps the correct predicate
      // until blend settles at 0 (dropped lazily in produceFocusUniforms).
      void fade.fadeTo(0, FOCUS_FADE_DURATION_MS, nowMs);
    }
  }

  function produceFocusUniforms(nowMs: number): FocusUniformsValue {
    fade.tick(nowMs);
    const blend = fade.currentOpacity(nowMs);
    if (active !== null && blend === 0 && !fade.isAnimating(nowMs)) {
      active = null;
    }
    if (active === null) return ZERO_FOCUS;
    return {
      center: active.center,
      radiusMpc: active.radiusMpc,
      blend,
      invert: active.invert,
    };
  }

  function isAwake(nowMs: number): boolean {
    return fade.isAnimating(nowMs);
  }

  return {
    id: 'clusterFocus',
    update,
    produceFocusUniforms,
    isAwake,
    destroy(): void {
      active = null;
      focusedId = null;
    },
  };
}
