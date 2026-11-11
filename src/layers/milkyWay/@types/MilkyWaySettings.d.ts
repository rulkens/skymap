/**
 * MilkyWaySettings — the user-facing state of the Milky-Way singleton overlay
 * (see `docs/superpowers/conventions/singleton-overlay-layers.md`): two
 * independent visibility axes, the renderer switch, and one knob group per
 * module, `cloud` (v1 sprites) and `field` (v2 analytic field). Grouping the
 * knobs keeps a patch to one group from ever touching the other or the
 * visibility axes. Named for the settings bag, the tour's `SettingsSnapshot`
 * and the DebugPanel tuning section, which all reference one shape.
 */
import type { MilkyWayCloudTuning } from '../../../@types/settings/MilkyWayCloudTuning';
import type { MilkyWayFieldTuning } from './MilkyWayFieldTuning';
import type { MilkyWayRenderer } from './MilkyWayRenderer';

export type MilkyWaySettings = {
  /** The galactic disk at the centre, whichever renderer draws it. */
  enabled: boolean;
  /** The "You are here" text label. */
  labelEnabled: boolean;
  renderer: MilkyWayRenderer;
  cloud: MilkyWayCloudTuning;
  field: MilkyWayFieldTuning;
};
