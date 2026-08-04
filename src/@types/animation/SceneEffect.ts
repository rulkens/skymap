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
 *     the UI does (e.g. `setMilkyWayEnabled(true)`) then fades in/out over `over`
 *     seconds. `over` omitted → default fade duration; `0` → instant.
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
 *     steady pole.
 *
 *     Only TWO of the interactive switch's three effects fire here —
 *     `watchOrientationChangeSaga` also re-encodes `camera.base` into the new
 *     frame (`commitCameraPose(reencodePose(...))`); this cue does not. That
 *     is not a missing step: `frameTo` only ever fires while the clip driver
 *     (priority 95, `cameraDrivers.ts`) is the active pose author, and that
 *     driver re-derives its pose from scratch EVERY frame — `evaluateClip`
 *     against the pinned `clip.frame`, re-encoded into the CURRENT
 *     `settings.orientation` — so `base` is not what's on screen and is not
 *     what commit-on-edge reads either: it bakes the driver's own
 *     already-current-frame pose (`lastPose`) when the clip ends, never a
 *     stale `base`. The interactive path needs the explicit re-encode because
 *     THERE `base` (or a driver derived from it) is what renders immediately;
 *     inside a clip it never is until the clip is already gone. Re-derive
 *     this from `cameraDrivers.ts`'s `clip` row before assuming a
 *     `commitCameraPose` belongs here — it would double-write nothing, but it
 *     would be motivated by a symmetry that doesn't hold in this direction.
 *
 * ### `layers` are `VisibilityLayerKey`s; `scoped` are per-item entries
 *
 * The keys in `show`/`hide`/`fade` are the same intent-addressing vocabulary the
 * UI and `syncVisibilityFades` use: `'flow'`, `'survey'`, `'filaments'`,
 * `'structureRing'`, `'milkyWayDisk'`, etc. A cue on a multi-item layer (e.g.
 * `'survey'`) sets the cluster gate; the bridge expands to individual items.
 * See `src/@types/animation/VisibilityLayerKey.d.ts` for the full set.
 *
 * `show`/`hide` additionally carry `scoped` — `'family:scope'` entries
 * (`'survey:milliquas'`, `'structureRing:group'`, `'label:milkyWay'`) that
 * address ONE item of a per-item layer. Authors write them inline in the same
 * list (`hide(['flow', 'survey:milliquas'])`); the helper splits them out at
 * construction because they take a different path at fire time: a targeted
 * settings action + the reactive fade bridge, rather than the row fan-out +
 * explicit fade sync. `fade` has no scoped form — the clipOpacity channel is
 * keyed by atomic layer.
 */

import type { VisibilityLayerKey } from './VisibilityLayerKey';
import type { ScopedVisibilityArg } from './ScopedVisibilityArg';
import type { SettingsAction } from './SettingsAction';
import type { SelectionRef } from '../engine/SelectionRef';
import type { OrientationFrameId } from '../camera/OrientationFrameId';
import type { Ease } from './Ease';

export type SceneEffect =
  | {
      readonly kind: 'show';
      readonly layers: VisibilityLayerKey[];
      readonly scoped?: ScopedVisibilityArg[];
      readonly over?: number;
    }
  | {
      readonly kind: 'hide';
      readonly layers: VisibilityLayerKey[];
      readonly scoped?: ScopedVisibilityArg[];
      readonly over?: number;
    }
  | {
      readonly kind: 'fade';
      readonly layers: VisibilityLayerKey[];
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
