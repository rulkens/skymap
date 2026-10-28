/**
 * CameraControlsSection — the control-scheme select and, for the OpenSpace
 * scheme only, its friction dials. Props only; `CameraControlsSectionContainer`
 * owns the store reach.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import type { FocusMoveStyle } from '../../@types/camera/FocusMoveStyle';
import type { ControlSchemeId } from '../../@types/engine/camera/ControlSchemeId';
import type { FrictionGroup } from '../../@types/camera/FrictionGroup';
import type { CameraControlsSettings } from '../../@types/settings/CameraControlsSettings';
import { parseFocusMoveStyle } from '../../utils/storage/parseFocusMoveStyle';
import CollapsibleSection from './CollapsibleSection';
import Slider from '../common/Slider/Slider';
import styles from './SettingsPanel.module.css';

const FRICTION_TOGGLES: readonly { group: FrictionGroup; label: string }[] = [
  { group: 'rotational', label: 'Orbit' },
  { group: 'zoom', label: 'Zoom' },
  { group: 'roll', label: 'Look & roll' },
];

const FOCUS_MOVE_STYLE_LABELS: Readonly<Record<FocusMoveStyle, string>> = {
  eased: 'Eased',
  geodesic: 'Geodesic',
};

export type CameraControlsSectionProps = {
  readonly controls: CameraControlsSettings;
  readonly focusMoveStyle: FocusMoveStyle;
  readonly onFocusMoveStyleChange: (style: FocusMoveStyle) => void;
  readonly onSchemeChange: (scheme: ControlSchemeId) => void;
  readonly onFrictionChange: (friction: number) => void;
  readonly onFrictionOnChange: (group: FrictionGroup, on: boolean) => void;
};

function CameraControlsSection({
  controls,
  focusMoveStyle,
  onFocusMoveStyleChange,
  onSchemeChange,
  onFrictionChange,
  onFrictionOnChange,
}: CameraControlsSectionProps): ReactNode {
  return (
    <CollapsibleSection title="Camera controls">
      <div className={styles.panelRow}>
        <label htmlFor="control-scheme">Scheme (Shift+C)</label>
        <select
          id="control-scheme"
          className={styles.modeSelect}
          value={controls.scheme}
          onChange={(e) => onSchemeChange(e.target.value as ControlSchemeId)}
        >
          <option value="skymap">Skymap</option>
          <option value="openspace">OpenSpace</option>
        </select>
      </div>

      <div className={styles.panelRow}>
        <label htmlFor="focus-move-style">Focus moves</label>
        <select
          id="focus-move-style"
          className={styles.modeSelect}
          value={focusMoveStyle}
          onChange={(e) => {
            const style = parseFocusMoveStyle(e.target.value);
            if (style !== null) onFocusMoveStyleChange(style);
          }}
        >
          {Object.entries(FOCUS_MOVE_STYLE_LABELS).map(([style, label]) => (
            <option key={style} value={style}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {controls.scheme === 'openspace' && (
        <>
          {FRICTION_TOGGLES.map(({ group, label }) => (
            <div className={styles.panelRow} key={group}>
              <label htmlFor={`friction-${group}`}>{label} friction</label>
              <input
                id={`friction-${group}`}
                type="checkbox"
                className={styles.toggle}
                checked={controls.frictionOn[group]}
                onChange={(e) => onFrictionOnChange(group, e.target.checked)}
              />
            </div>
          ))}
          <div className={styles.panelRow}>
            <Slider
              label="Friction"
              value={controls.friction}
              min={0}
              max={1}
              step={0.05}
              onChange={onFrictionChange}
            />
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

export default memo(CameraControlsSection);
