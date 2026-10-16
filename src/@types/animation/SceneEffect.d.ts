/**
 * SceneEffect — the tagged-union of scene mutations a clip can cue.
 *
 * Scene effects are timeline CUES, not frame-driven: they fire once as the
 * playback clock crosses them, then are done. They change what is DRAWN (which
 * layers are visible, which setting is active, what is focused), not where the
 * CAMERA is. That separation is intentional — camera motion and scene state are
 * independent axes of a clip, and keeping them separate lets the evaluator handle
 * each without knowledge of the other.
 *
 * Every arm is a plain serializable object. `effectHelpers.ts` (Task 3) is the
 * ONLY constructor — authors never write raw `{ kind: … }` objects. Plan C
 * imports this type and does NOT redeclare it; this file is the ONE canonical
 * home.
 *
 * ### The six arms
 *
 *   - `show` / `hide` — visibility INTENT. Dispatches the same settings actions
 *     the UI does (`setVisibility`), which fades in/out over `over` seconds.
 *     `over` omitted → default fade duration; `0` → instant.
 *
 *   - `fade` — transient opacity move. Does NOT touch intent; only drives
 *     `clipOpacity` (the clip-owned channel that multiplies into final alpha).
 *     The layer stays loaded/enabled behind the fade. Resets to 1 at clip end.
 *     The cross-dissolve and "load behind mask then reveal" idioms both use this.
 *
 *   - `scene` — a non-visibility settings change. `action` is a `SettingsAction`
 *     (a narrow union of settings-slice creators the clip model has approved);
 *     every reconcile saga fires for free. Widens in Plan C as the tour needs more
 *     knobs.
 *
 *   - `focus` — set the selection focus to `ref` (or `null` to clear). Drives the
 *     structure-isolation dim (`focusRecession` channel). `SelectionRef` carries
 *     a galaxyCatalog/structure/milkyWay discriminant and the durable id.
 *
 *   - `frameTo` — cue-style orientation-frame reorientation. Fires
 *     `setOrientation(frame)` (persists the target pole past the clip) then
 *     `startFrameTween` (rolls the up-basis toward it over `over` seconds). Like
 *     the other cues it awaits ZERO duration — a beat that wants to dwell through
 *     the roll sequences a `wait(over)` after it. The alternative — an awaited
 *     camera-track writer — was rejected: the roll composes over the LIVE basis
 *     `B(t)` captured at fire time (symmetric with the interactive
 *     `watchOrientationChangeSaga`'s roll), so a `frameTo` firing mid-roll
 *     continues from wherever the pole is rather than snapping back to a
 *     steady pole. `commitCameraPose` is not dispatched here — see
 *     `stepCameraRuntime`, the loop stage that re-encodes `base` itself.
 *
 * ### `args` are visibility addresses
 *
 * `show`/`hide`/`fade` name the addresses `APP_VISIBILITY` derives: show keys
 * (`'flow'`, `'survey'`), label addresses (`'label:milkyWay'`) and, for
 * `show`/`hide`, one item of a per-item entry (`'survey:milliquas'`,
 * `'label:structure:void'`). `'labels'` is expanded at construction, so a stored
 * effect holds atomic addresses only. Every arg takes one path at fire time
 * (`setVisibilityActionsFor`, the write carrying `over`). `fade` has no scoped
 * form: the clip channel is keyed by address.
 */

import type { VisibilityAddress } from './VisibilityAddress';
import type { ScopedVisibilityAddress } from './ScopedVisibilityAddress';
import type { SettingsAction } from './SettingsAction';
import type { SelectionRef } from '../engine/SelectionRef';
import type { OrientationFrameId } from '../camera/OrientationFrameId';
import type { Ease } from './Ease';

export type SceneEffect =
  | {
      readonly kind: 'show';
      readonly args: (VisibilityAddress | ScopedVisibilityAddress)[];
      readonly over?: number;
    }
  | {
      readonly kind: 'hide';
      readonly args: (VisibilityAddress | ScopedVisibilityAddress)[];
      readonly over?: number;
    }
  | {
      readonly kind: 'fade';
      readonly args: VisibilityAddress[];
      readonly to: number;
      readonly over: number;
    }
  | {
      readonly kind: 'scene';
      readonly action: SettingsAction;
    }
  | {
      readonly kind: 'focus';
      readonly ref: SelectionRef | null;
    }
  | {
      readonly kind: 'frameTo';
      readonly frame: OrientationFrameId;
      readonly over: number;
      readonly ease: Ease;
    };
