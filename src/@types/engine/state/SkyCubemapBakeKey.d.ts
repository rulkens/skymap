import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { SelectionState } from '../../store/SelectionState';
import type { Tier } from '../../data/Tier';

/**
 * SkyCubemapBakeKey — the inputs the black-hole lens's sky-cubemap capture
 * was baked from. `skyCubemapNeedsBake` compares one of these against the
 * current frame's to decide whether to re-sweep all six faces.
 */
export type SkyCubemapBakeKey = {
  /** Compared by REFERENCE: the settings slice is replaced on every store write, so any settings change re-bakes. Over-triggering is harmless (one 6-face sweep). */
  readonly settings: EngineSettingsState;
  /** By reference — the selected galaxy's halo is drawn into the sprites the capture sees. */
  readonly selection: SelectionState;
  readonly tier: Tier;
  /** The `sky-cubemap` row's ALLOCATED per-axis size; the resolution knob reallocates the row (fresh, cleared texture). */
  readonly faceSizePx: number;
  /** True while any roster layer's input is still moving — a source-visibility ramp, or a thumbnail bitmap in flight / in its load fade; the bake runs every such frame and once more when it settles. */
  readonly rosterSettling: boolean;
};
