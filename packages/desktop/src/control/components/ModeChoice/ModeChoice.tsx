/** ModeChoice — kiosk or dome as two drawn cards; picking one is the whole action, it saves at once. */

import type { ReactNode } from 'react';
import type { InstallSetup } from '../../../@types/InstallSetup';
import DomeDrawing from '../DomeDrawing/DomeDrawing';
import KioskDrawing from '../KioskDrawing/KioskDrawing';
import { MODES } from './ModeChoice.constants';
import chrome from '../controlChrome.module.css';
import styles from './ModeChoice.module.css';

export type ModeChoiceProps = {
  readonly mode: InstallSetup['mode'];
  readonly onPick: (mode: InstallSetup['mode']) => void;
  /** Smaller drawings, for the controls' panel. */
  readonly compact?: boolean;
};

function ModeChoice({ mode, onPick, compact = false }: ModeChoiceProps): ReactNode {
  return (
    <fieldset className={styles.root}>
      <legend className={chrome.unseen}>Where it shows</legend>
      {MODES.map((option) => (
        <label key={option.mode} className={chrome.card}>
          <input
            type="radio"
            name="mode"
            className={chrome.unseen}
            checked={mode === option.mode}
            onChange={() => onPick(option.mode)}
          />
          <span className={compact ? styles.drawingSmall : styles.drawing}>
            {option.mode === 'kiosk' ? <KioskDrawing /> : <DomeDrawing />}
          </span>
          <span className={chrome.cardHead}>
            <span className={mode === option.mode ? chrome.markerOn : chrome.marker} />
            {option.name}
          </span>
          <span className={chrome.dim}>{option.what}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default ModeChoice;
