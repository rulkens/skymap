/**
 * SettingsSnapshot — the takeover's capture/restore baseline for settings.
 * Keys: every Layer cluster (derived from APP_SETTINGS_SLICES) plus the core list in
 * `coreSnapshotClusters.ts`, whose header gives each core cluster's reason.
 * Invariant: every visibility entry's cluster (a cue's write target) is captured, guarded by
 * `visibilityCuesWriteCapturedClusters.test.ts`.
 * Excluded core clusters: `tonemap`, `bloom`, `hdr`, `debug` (the tour never drives them).
 * `orientation` rides `SceneSnapshot` instead; see its header.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { LayerSettingsClusterKey } from '../../settings/LayerSettingsClusterKey';
import type { CORE_SNAPSHOT_CLUSTERS } from '../../../data/settings/coreSnapshotClusters';

export type SettingsSnapshot = Readonly<
  Pick<EngineSettingsState, LayerSettingsClusterKey | (typeof CORE_SNAPSHOT_CLUSTERS)[number]>
>;
