/**
 * LayerToggles — enable/disable each renderable layer independently.
 *
 * Unlike ModeTabs (one-of-N), layers COMPOSITE, so each is its own on/off
 * Toggle. Presentational: current booleans in, a single `onToggle(layer)` out.
 * The control panel wires these to the view slice + the engine's enabled set.
 */
import type { ReactNode } from 'react';
import Toggle from '../Toggle/Toggle';
import styles from './LayerToggles.module.css';

export type LayerTogglesProps = {
  readonly flowField: boolean;
  readonly densityVolume: boolean;
  readonly onToggle: (layer: 'flowField' | 'densityVolume') => void;
};

function LayerToggles({ flowField, densityVolume, onToggle }: LayerTogglesProps): ReactNode {
  return (
    <div className={styles.toggles}>
      <Toggle label="flow" on={flowField} onToggle={() => onToggle('flowField')} />
      <Toggle label="density" on={densityVolume} onToggle={() => onToggle('densityVolume')} />
    </div>
  );
}

export default LayerToggles;
