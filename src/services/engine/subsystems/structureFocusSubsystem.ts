/**
 * structureFocusSubsystem — focus-driven structure "focus mode".
 *
 * When a cluster / supercluster / void / group POI is focused, non-member
 * galaxies fade to ~8% alpha over ~400 ms (the shader does the
 * per-vertex membership test; this subsystem only supplies the centre,
 * radius, and the smoothstep blend). All four categories behave
 * identically — the focused structure's interior galaxies stay bright;
 * voids are just an underdense case of the same rule. See
 * `StructureFocusSubsystem.d.ts` for the rationale (focus as single
 * source of truth; GPU re-derivation instead of a CPU member list).
 *
 * ### Why a `focusedId` separate from the display target
 *
 * `update` runs every frame with the live focused POI. The fade-in and
 * fade-out must each fire once, on the transition — re-calling
 * `fade.fadeTo` every frame would reset the ramp's clock and the blend
 * would never advance. `focusedId` records the id we are fading *toward*
 * (null = fading out / at rest), so a frame matching it is a no-op.
 *
 * The display target (`active`) stays latched through the fade-out so
 * `produceFocusUniforms` keeps emitting the correct centre/radius until
 * the blend reaches 0; only then is it dropped.
 */

import { createFadeController } from '../../animation/fadeController';
import type { StructureFocusSubsystem } from '../../../@types/engine/subsystems/StructureFocusSubsystem';
import type { StructureRecord } from '../../../@types/engine/data/StructureRecord';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { Vec3 } from '../../../@types/math/Vec3';

/** Focus fade duration in ms. */
export const FOCUS_FADE_DURATION_MS = 400;

/**
 * At-rest sentinel: blend=0 makes the shader multiplier collapse to 1.0.
 * `apparentRadiusMpc` is 1 (not 0) so the shader's smoothstep edges are
 * never equal — a degenerate edge0 == edge1 would risk a NaN that mix()
 * propagates even at blend 0. The values are otherwise don't-cares here.
 */
const ZERO_FOCUS: FocusUniformsValue = {
  center: [0, 0, 0],
  apparentRadiusMpc: 1,
  physicalRadiusMpc: 0,
  blend: 0,
};

/** The latched display target while focus is active or fading out. */
type ActiveFocus = {
  readonly id: string;
  readonly center: Vec3;
  readonly apparentRadiusMpc: number;
  readonly physicalRadiusMpc: number;
};

export function createStructureFocusSubsystem(
  initialNowMs: number = performance.now(),
): StructureFocusSubsystem {
  const fade = createFadeController(0, initialNowMs);
  // The POI we emit centre/radius for. Latched through fade-out.
  let active: ActiveFocus | null = null;
  // The id we are currently fading toward; null = fading out / at rest.
  let focusedId: string | null = null;

  function update(poi: StructureRecord | null, nowMs: number): void {
    // Narrow to a focus-eligible extended-structure POI. famousGalaxy has
    // no radius, so it (and null) drives a fade-out. Groups share the
    // same fade band mechanic as clusters — R0 > Rh gives a real band.
    let next: ActiveFocus | null = null;
    if (
      poi !== null &&
      (poi.category === 'cluster' ||
        poi.category === 'supercluster' ||
        poi.category === 'void' ||
        poi.category === 'group')
    ) {
      // Pass the structure's two real radii; the shader ramps the fade
      // across the [physical, apparent] band (and supplies a soft band of
      // its own when the two are equal — SC/void have no wider extent).
      next = {
        id: poi.id,
        center: [poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]],
        apparentRadiusMpc: poi.apparentRadiusMpc ?? poi.physicalRadiusMpc,
        physicalRadiusMpc: poi.physicalRadiusMpc,
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
      apparentRadiusMpc: active.apparentRadiusMpc,
      physicalRadiusMpc: active.physicalRadiusMpc,
      blend,
    };
  }

  function isAwake(nowMs: number): boolean {
    return fade.isAnimating(nowMs);
  }

  return {
    id: 'structureFocus',
    update,
    produceFocusUniforms,
    isAwake,
    destroy(): void {
      active = null;
      focusedId = null;
    },
  };
}
