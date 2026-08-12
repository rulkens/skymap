/**
 * ZoneOfAvoidanceSettings — the user-facing state of the Zone-of-Avoidance
 * singleton overlay: the galactic-plane dust band that visually explains
 * why the catalogs thin out near b=0.
 *
 * Zone of Avoidance is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): all of its
 * user-facing state lives in `settings.zoneOfAvoidance`, exactly as
 * `milkyWay` / `filaments` / `flow` do. This is the shape of that slice —
 * two independent visibility axes plus the band's look knobs.
 *
 * Named (rather than inlined into `EngineSettingsState`) for the same reason
 * `MilkyWaySettings` is: the settings bag, the tour's `SettingsSnapshot`
 * capture, and the DebugPanel tuning section all reference one shape.
 */
import type { ZoneOfAvoidanceTuning } from './ZoneOfAvoidanceTuning';

export type ZoneOfAvoidanceSettings = {
  /** The galactic-plane dust band itself. */
  enabled: boolean;
  /** The "Zone of Avoidance" text label. */
  labelEnabled: boolean;
} & ZoneOfAvoidanceTuning;
