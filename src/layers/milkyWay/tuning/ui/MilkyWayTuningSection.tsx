/**
 * MilkyWayTuningSection — DebugPanel subsection for the Milky Way: the renderer
 * switch first, then the v1 cloud rows when the cloud draws and the v2 field
 * rows (and its dust toggle) when the field draws. Dev-only; the
 * explorer-facing SettingsPanel surfaces only the visibility toggle. The copy
 * button promotes a tuned cloud session to code via `formatMilkyWayCloudTuningDefaults`.
 */

import type { ReactElement } from 'react';
import type { MilkyWaySettings } from '../../@types/MilkyWaySettings';
import type { MilkyWayFieldTuning } from '../../@types/MilkyWayFieldTuning';
import type { MilkyWayRenderer } from '../../@types/MilkyWayRenderer';
import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';
import {
  MILKY_WAY_CLOUD_SLIDER_FIELDS,
  milkyWayCloudSliderPatch,
} from '../data/milkyWayCloudSliderFields';
import { MILKY_WAY_FIELD_SLIDER_FIELDS } from '../data/milkyWayFieldSliderFields';
import { selectMilkyWayParts } from '../../state/milkyWay/selectors';
import { MILKY_WAY_CLOUD_TUNING_DEFAULTS } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { formatMilkyWayCloudTuningDefaults } from '../utils/formatMilkyWayCloudTuningDefaults';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugSection from '../../../../components/DebugPanel/DebugSection';
import DebugSlider from '../../../../components/DebugPanel/DebugSlider';
import sliderStyles from '../../../../components/DebugPanel/DebugSlider.module.css';
import toggleStyles from '../../../../components/DebugPanel/DebugOverlayToggles.module.css';
import { milkyWayFieldSliderPatch } from '../utils/milkyWayFieldSliderPatch';

export type MilkyWayTuningSectionProps = {
  milkyWay: MilkyWaySettings;
  onCloudChange: (patch: Partial<MilkyWayCloudTuning>) => void;
  onFieldChange: (patch: Partial<MilkyWayFieldTuning>) => void;
  onRendererChange: (renderer: MilkyWayRenderer) => void;
};

const RENDERERS: readonly MilkyWayRenderer[] = ['v1', 'v2', 'both'];

export function MilkyWayTuningSection({
  milkyWay,
  onCloudChange,
  onFieldChange,
  onRendererChange,
}: MilkyWayTuningSectionProps): ReactElement {
  const parts = selectMilkyWayParts(milkyWay);
  const fieldValues = { exposure: milkyWay.field.exposure, ...milkyWay.field.divisors };
  return (
    <DebugSection title="Milky Way tuning">
      <div
        className={sliderStyles.root}
        title="Which Milky Way draws: v1 star sprites, v2 analytic field, or both summed."
      >
        <span className={sliderStyles.label}>renderer</span>
        <span className={sliderStyles.readout}>{milkyWay.renderer}</span>
        <select
          aria-label="renderer"
          value={milkyWay.renderer}
          onChange={(e) => onRendererChange(e.target.value as MilkyWayRenderer)}
        >
          {RENDERERS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {parts.cloud &&
        MILKY_WAY_CLOUD_SLIDER_FIELDS.map((f) => (
          <DebugSlider
            key={f.key}
            label={f.label}
            value={milkyWay.cloud[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            readout={f.format(milkyWay.cloud[f.key])}
            title={f.title}
            onChange={(v) => onCloudChange(milkyWayCloudSliderPatch(f.key, v))}
          />
        ))}
      {parts.cloud && (
        <CopyButton
          text={formatMilkyWayCloudTuningDefaults(milkyWay.cloud, MILKY_WAY_CLOUD_TUNING_DEFAULTS)}
          label="Copy changed defaults"
          title="Paste into MILKY_WAY_CLOUD_TUNING_DEFAULTS in milkyWayCalibration.ts"
        />
      )}
      {parts.field &&
        MILKY_WAY_FIELD_SLIDER_FIELDS.map((f) => (
          <DebugSlider
            key={f.key}
            label={f.label}
            value={fieldValues[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            readout={f.format(fieldValues[f.key])}
            title={f.title}
            onChange={(v) => onFieldChange(milkyWayFieldSliderPatch(milkyWay.field, f.key, v))}
          />
        ))}
      {parts.field && (
        <label className={toggleStyles.checkRow}>
          <input
            type="checkbox"
            checked={milkyWay.field.dust}
            onChange={(e) => onFieldChange({ dust: e.target.checked })}
          />
          <span>field dust</span>
        </label>
      )}
    </DebugSection>
  );
}
