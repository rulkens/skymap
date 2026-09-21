/**
 * FocusBoundEffect — a tagged-union of the focus-addressed effects that
 * carry a `FocusId` rather than a concrete `SelectionRef`.
 *
 * These are the UNRESOLVED forms: they are authored into a clip at module load
 * time using a durable `FocusId` handle (e.g. `focusId('m87')`), then rewritten
 * to concrete effects by `resolveClipFoci` immediately before `compileClip` runs.
 * `compileClip` treats them as programming errors and throws if it ever sees one
 * unresolved — see the explicit `moveTargetId` / `dollyToId` / `lookAtId` /
 * `strafeId` / `spinToId` / `focusId` throw cases in its `walk` switch.
 *
 * ### Why a separate type rather than optional fields on the concrete arms?
 *
 * The concrete forms (`kind:'setVec'` for target, `kind:'focus'` for selection)
 * carry a resolved `Vec3` or `SelectionRef`. Allowing an `id` field alongside
 * those would let a value be both resolved AND unresolved — an invalid state
 * the type system cannot catch. Separate discriminants (`moveTargetId`,
 * `dollyToId`, `focusId`) make the resolved/unresolved distinction structural:
 * you cannot accidentally pass an unresolved effect to a function that expects
 * a concrete one.
 *
 * ### `focusId` vs `kind:'focus'`
 *
 * The `kind:'focus'` arm in `SceneEffect` carries a resolved `SelectionRef` and
 * is what `applySceneEffect` dispatches. `kind:'focusId'` is the clip-authoring
 * surface: authors write `focus(id)`, `resolveClipFoci` resolves it to
 * `kind:'focus'` with the matching `SelectionRef` at play time.
 */

import type { Ease } from './Ease';
import type { FocusId } from './FocusId';

export type FocusBoundEffect =
  | {
      readonly kind: 'moveTargetId';
      readonly id: FocusId;
      readonly over: number;
      readonly ease: Ease;
    }
  | {
      readonly kind: 'dollyToId';
      readonly id: FocusId;
      readonly over: number;
      readonly ease: Ease;
      /** Multiplier on the resolved framing distance (1 = standard framing) — see `dollyToId`. */
      readonly scale?: number;
    }
  | { readonly kind: 'lookAtId'; readonly id: FocusId; readonly over: number; readonly ease: Ease }
  | {
      readonly kind: 'strafeId';
      readonly id: FocusId;
      /** Lateral swing, degrees of frame at the anchor's depth — see `strafeId` helper. */
      readonly byDeg: number;
      readonly over: number;
      readonly ease: Ease;
    }
  | {
      readonly kind: 'spinToId';
      readonly id: FocusId;
      readonly over: number;
      readonly ease: Ease;
      /** Extra full revolutions folded into the yaw delta before resolving — see `spinToId` helper. */
      readonly turns?: number;
    }
  | { readonly kind: 'focusId'; readonly id: FocusId | null };
