/**
 * Zone of Avoidance tuning subsection; look knobs from `ZONE_OF_AVOIDANCE_SLIDER_FIELDS`.
 * Color pickers (LINEAR RGB values) convert via sRGB↔linear for the widget.
 * Dev-only; SettingsPanel surfaces visibility toggles only.
 */

import type { ReactElement } from 'react';
import type { ZoneOfAvoidanceSettings } from '../../@types/ZoneOfAvoidanceSettings';
import type { ZoneOfAvoidanceTuning } from '../../@types/ZoneOfAvoidanceTuning';
import { formatZoneOfAvoidanceTuningDefaults } from '../utils/formatZoneOfAvoidanceTuningDefaults';
import {
  ZONE_OF_AVOIDANCE_SLIDER_FIELDS,
  zoneOfAvoidanceSliderPatch,
} from '../data/zoneOfAvoidanceSliderFields';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';

export type ZoneOfAvoidanceTuningSectionProps = {
  zoneOfAvoidance: ZoneOfAvoidanceSettings;
  onChange: (patch: Partial<ZoneOfAvoidanceTuning>) => void;
};

export function ZoneOfAvoidanceTuningSection({
  zoneOfAvoidance,
  onChange,
}: ZoneOfAvoidanceTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Zone of Avoidance tuning"
      fields={ZONE_OF_AVOIDANCE_SLIDER_FIELDS}
      values={zoneOfAvoidance}
      onSliderChange={(k, v) => onChange(zoneOfAvoidanceSliderPatch(k, v))}
    >
      <DebugColorRow
        label="color"
        title="Veil tint, linear RGB (picker speaks sRGB)."
        value={zoneOfAvoidance.color}
        onChange={(color) => onChange({ color })}
      />
      <DebugColorRow
        label="labelColor"
        title="Curved-lettering tint, linear RGB (picker speaks sRGB)."
        value={zoneOfAvoidance.labelColor}
        onChange={(labelColor) => onChange({ labelColor })}
      />
      <CopyButton
        text={formatZoneOfAvoidanceTuningDefaults(zoneOfAvoidance)}
        label="Copy current defaults"
        title="Paste into DEFAULT_ZONE_OF_AVOIDANCE_TUNING in data/defaults.ts"
      />
    </DebugTuningSection>
  );
}
