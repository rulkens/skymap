/**
 * SettingsSnapshot — the whole-cluster capture the cinematic tour takes
 * before it plays an effect, and restores afterwards.
 *
 * ### Why this key set
 *
 * Every Layer settings cluster (`LayerSettingsClusterKey`, read off
 * `APP_SETTINGS_SLICES`) plus the short core list in `coreSnapshotClusters.ts`.
 * The invariant it serves: every key in `VISIBILITY_LAYER_ROWS` is addressable
 * by a clip's `hide()`/`show()` cue, which writes visibility INTENT into
 * settings, so each must resolve to a captured cluster or a tour that hides a
 * layer leaves it hidden after the restore. Deriving the Layer half means a new
 * Layer joins by being composed in, not by someone remembering this file.
 * Capturing a cluster the takeover never writes is a no-op on restore.
 *
 * The core clusters left out (`tonemap`, `bloom`, `hdr`, `debug`) are
 * deliberately excluded: the tour neither drives nor restores them, so
 * capturing them would invite a restore that stomps a value the tour never
 * meant to own. That test is what admitted `camera` — excluded on the same
 * grounds until the bracket started pinning the FOV.
 *
 * `orientation` is deliberately NOT here, even though it is a `mergeSnapshot`
 * payload's sibling concern conceptually: it rides on `SceneSnapshot` instead,
 * beside `focus` — see that type's header for why. The precedent is
 * `tierSlice` (`src/state/tier/tierSlice.ts`), which was pulled out of
 * `settings` for the identical reason: a scalar that lives inside a
 * `Pick<EngineSettingsState, …>` a whole-cluster restore can reach gets swept
 * as a side effect of an unrelated merge. Keeping `orientation` off this type
 * makes that failure mode a compile error, not a runtime landmine — see
 * `mergeSettingsSnapshot`'s reducer, which spreads whatever this type allows.
 *
 * ### Why Readonly
 *
 * A captured snapshot is a frozen baseline — restore reads it, nothing
 * writes it. Marking it `Readonly` keeps a caller from mutating the
 * captured value in place and silently corrupting what gets restored.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { LayerSettingsClusterKey } from '../../settings/LayerSettingsClusterKey';
import type { CORE_SNAPSHOT_CLUSTERS } from '../../../data/settings/coreSnapshotClusters';

export type SettingsSnapshot = Readonly<
  Pick<EngineSettingsState, LayerSettingsClusterKey | (typeof CORE_SNAPSHOT_CLUSTERS)[number]>
>;
