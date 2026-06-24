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
 * ### The five arms
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
 * ### `layers` are `VisibilityLayerKey`s
 *
 * The keys in `show`/`hide`/`fade` are the same intent-addressing vocabulary the
 * UI and `syncVisibilityFades` use: `'flow'`, `'survey'`, `'filaments'`,
 * `'structureRing'`, `'milkyWayDisk'`, etc. A cue on a multi-item layer (e.g.
 * `'survey'`) sets the cluster gate; the bridge expands to individual items.
 * See `src/@types/animation/VisibilityLayerKey.d.ts` for the full set.
 *
 * NOTE (flag): the `cosmicFlows` spike example uses composite aliases
 * (`'volumes'`, `'galaxies'`, `'structures'`, `'labels'`) that are NOT currently
 * members of `VisibilityLayerKey`. Authors must use the actual keys
 * (`'volumesMaster'` / `'volumeField'`, `'survey'`, `'structureRing'` /
 * `'structureLabel'`, `'surveyLabel'`) until Plan C adds higher-level composite
 * keys to `VisibilityLayerKey`.
 */

import type { VisibilityLayerKey } from './VisibilityLayerKey';
import type { SettingsAction } from './SettingsAction';
import type { SelectionRef } from '../engine/SelectionRef';

export type SceneEffect =
  | {
      readonly kind: 'show';
      readonly layers: VisibilityLayerKey[];
      readonly over?: number;
    }
  | {
      readonly kind: 'hide';
      readonly layers: VisibilityLayerKey[];
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
    };
