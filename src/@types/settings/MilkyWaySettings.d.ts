/**
 * MilkyWaySettings — the user-facing state of the Milky-Way singleton overlay.
 *
 * Milky Way is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): all of its
 * user-facing state lives in `settings.milkyWay`, exactly as `filaments` and
 * `flow` do. This is the shape of that slice — two independent visibility axes
 * plus the star-cloud look knobs the cloud renderer reads every frame.
 *
 * Named (rather than inlined into `EngineSettingsState`) for the same reason
 * `FlowSettings` is: the settings bag, the tour's `SettingsSnapshot` capture,
 * and the DebugPanel tuning section all reference one shape.
 *
 * The two visibility axes are fully independent — the label can show with the
 * disk hidden and vice-versa. Unlike the per-record source-type clusters
 * (`structures` / `galaxyCatalogs`), a singleton overlay has no `items` row, so
 * both axes are flat fields here.
 */
import type { MilkyWayTuning } from './MilkyWayTuning';

export type MilkyWaySettings = {
  /** The generated star+dust point cloud at the galactic centre. */
  enabled: boolean;
  /** The "You are here" text label. */
  labelEnabled: boolean;
} & MilkyWayTuning;
