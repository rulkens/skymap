/**
 * structureFocusSubsystem — focus mode: one 400 ms blend for whichever receding row is focused,
 * plus, for a subject with a sphere, the centre and radii the shaders' per-vertex dim reads.
 * `update` runs every frame but fades only on a transition (re-calling `fadeTo` would reset the
 * ramp's clock); `focusedKey` is the ref being faded toward. `active` stays latched through the
 * fade-out so the sphere and ref outlast `selection.focus` until the blend reaches 0. The fade
 * controller is private (no `FadeRegistry` wake), so `update` wakes the scheduler on each
 * transition — runFrame can early-return before its `stillAnimating` tail; steady frames rely on
 * `isAwake`.
 */

import { createFadeController } from '../../animation/fadeController';
import { refKey } from '../../../utils/selection/refKey';
import type { StructureFocusSubsystem } from '../../../@types/engine/subsystems/StructureFocusSubsystem';
import type { FocusSubject } from '../../../@types/engine/subsystems/FocusSubject';
import type { FocusFrame } from '../../../@types/engine/subsystems/FocusFrame';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';

/** Focus fade duration in ms. */
const FOCUS_FADE_DURATION_MS = 400;

/**
 * At-rest sentinel: blend=0 makes the shader multiplier collapse to 1.0.
 * `apparentRadiusMpc` is 1 (not 0) so the shader's smoothstep edges are
 * never equal — a degenerate edge0 == edge1 would risk a NaN that mix()
 * propagates even at blend 0. The values are otherwise don't-cares here.
 */
export const ZERO_FOCUS: FocusUniformsValue = {
  center: [0, 0, 0],
  apparentRadiusMpc: 1,
  physicalRadiusMpc: 0,
  blend: 0,
};

const AT_REST: FocusFrame = { uniforms: ZERO_FOCUS, blend: 0, ref: null };

export function createStructureFocusSubsystem(
  deps: { readonly requestRender: () => void },
  initialNowMs: number = performance.now(),
): StructureFocusSubsystem {
  const fade = createFadeController(0, initialNowMs);
  // The subject we emit for. Latched through fade-out.
  let active: FocusSubject | null = null;
  // The ref we are currently fading toward; null = fading out / at rest.
  let focusedKey: string | null = null;
  let last: FocusFrame = AT_REST;

  function update(subject: FocusSubject | null, nowMs: number): void {
    const targetKey = subject === null ? null : refKey(subject.ref);
    // No transition → no re-fade (covers the same subject every frame AND
    // an already-in-flight fade-out being re-observed every frame).
    if (targetKey === focusedKey) return;

    focusedKey = targetKey;
    if (subject !== null) {
      active = subject;
      fade.fadeTo(1, FOCUS_FADE_DURATION_MS, nowMs);
    } else {
      // Keep `active` latched so the shader keeps the correct predicate
      // until blend settles at 0 (dropped lazily in produceFocus).
      fade.fadeTo(0, FOCUS_FADE_DURATION_MS, nowMs);
    }
    // Essential wake: private fade controller — no FadeRegistry wake covers it.
    deps.requestRender();
  }

  function produceFocus(nowMs: number): FocusFrame {
    const blend = fade.currentOpacity(nowMs);
    if (active !== null && blend === 0 && !fade.isAnimating(nowMs)) {
      active = null;
    }
    last =
      active === null
        ? AT_REST
        : {
            uniforms: active.sphere === null ? ZERO_FOCUS : { ...active.sphere, blend },
            blend,
            ref: active.ref,
          };
    return last;
  }

  function isAwake(nowMs: number): boolean {
    return fade.isAnimating(nowMs);
  }

  return {
    id: 'structureFocus',
    update,
    produceFocus,
    lastFocus: () => last,
    isAwake,
    destroy(): void {
      active = null;
      focusedKey = null;
      last = AT_REST;
    },
  };
}
