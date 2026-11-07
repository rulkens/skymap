/**
 * structureFocusSubsystem — focus mode: one 400 ms blend for whichever receding row is focused,
 * and its sphere on a ramp of its own. A switch to a different sphere fades through: the old one
 * fades out, then the new one in, so the per-vertex dim never pops (a structure's ball and a
 * stream's recede-all sphere included). `update` runs every frame but fades only on a transition
 * (re-calling `fadeTo` would reset the ramp's clock). Ref and sphere stay latched through their
 * fade-outs, outlasting `selection.focus`. The fade controllers are private (no `FadeRegistry`
 * wake), so `update` wakes the scheduler on each transition; steady frames rely on `isAwake`.
 */

import { createFadeController } from '../../animation/fadeController';
import { refKey } from '../../../utils/selection/refKey';
import { sameFocusSphere } from '../../../utils/structure/sameFocusSphere';
import type { StructureFocusSubsystem } from '../../../@types/engine/subsystems/StructureFocusSubsystem';
import type { FocusSubject } from '../../../@types/engine/subsystems/FocusSubject';
import type { FocusFrame } from '../../../@types/engine/subsystems/FocusFrame';
import type { FocusUniformsValue } from '../../../@types/rendering/FocusUniformsValue';
import type { FocusSphere } from '../../../@types/rendering/FocusSphere';
import type { SelectionRefBase } from '../../../@types/engine/selection/SelectionRefBase';

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
  const sphereFade = createFadeController(0, initialNowMs);
  // What we emit for, each latched through its own fade-out; `queued` fades in once `sphere` is out.
  let ref: SelectionRefBase | null = null;
  let sphere: FocusSphere | null = null;
  let queued: FocusSphere | null = null;
  // The ref we are currently fading toward; null = fading out / at rest.
  let focusedKey: string | null = null;
  let last: FocusFrame = AT_REST;

  function update(subject: FocusSubject | null, nowMs: number): void {
    const targetKey = subject === null ? null : refKey(subject.ref);
    // No transition → no re-fade (covers the same subject every frame AND
    // an already-in-flight fade-out being re-observed every frame).
    if (targetKey === focusedKey) return;

    focusedKey = targetKey;
    fade.fadeTo(subject === null ? 0 : 1, FOCUS_FADE_DURATION_MS, nowMs);
    if (subject !== null) ref = subject.ref;
    const sphereChanges =
      subject !== null &&
      sphere !== null &&
      sphereFade.currentOpacity(nowMs) > 0 &&
      !sameFocusSphere(sphere, subject.sphere);
    if (subject === null || sphereChanges) {
      queued = subject?.sphere ?? null;
      sphereFade.fadeTo(0, FOCUS_FADE_DURATION_MS, nowMs);
    } else {
      queued = null;
      sphere = subject.sphere;
      sphereFade.fadeTo(1, FOCUS_FADE_DURATION_MS, nowMs);
    }
    // Essential wake: private fade controllers — no FadeRegistry wake covers them.
    deps.requestRender();
  }

  function produceFocus(nowMs: number): FocusFrame {
    const blend = fade.currentOpacity(nowMs);
    const sphereBlend = sphereFade.currentOpacity(nowMs);
    if (blend === 0 && !fade.isAnimating(nowMs)) ref = null;
    if (sphereBlend === 0 && !sphereFade.isAnimating(nowMs)) {
      sphere = queued;
      if (queued !== null) sphereFade.fadeTo(1, FOCUS_FADE_DURATION_MS, nowMs);
      queued = null;
    }
    last =
      ref === null && sphere === null
        ? AT_REST
        : {
            uniforms: sphere === null ? ZERO_FOCUS : { ...sphere, blend: sphereBlend },
            blend,
            ref,
          };
    return last;
  }

  function isAwake(nowMs: number): boolean {
    return fade.isAnimating(nowMs) || sphereFade.isAnimating(nowMs) || queued !== null;
  }

  return {
    id: 'structureFocus',
    update,
    produceFocus,
    lastFocus: () => last,
    isAwake,
    destroy(): void {
      ref = null;
      sphere = null;
      queued = null;
      focusedKey = null;
      last = AT_REST;
    },
  };
}
