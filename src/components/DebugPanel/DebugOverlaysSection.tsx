// src/components/DebugPanel/DebugOverlaysSection.tsx
/**
 * DebugOverlaysSection — checkbox list for the renderer's raw debug
 * overlays, row-driven from `DEBUG_OVERLAY_ROWS` (see that table for what
 * each toggle does).
 */

import { DEBUG_OVERLAY_ROWS } from '../../data/debug/debugOverlayRows';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import DebugSection from './DebugSection';
import styles from './DebugOverlaysSection.module.css';

export type DebugOverlaysSectionProps = {
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
};

function DebugOverlaysSection({ overlays, onToggle }: DebugOverlaysSectionProps) {
  return (
    <DebugSection title="Debug Overlays">
      {DEBUG_OVERLAY_ROWS.map((row) => (
        <label key={row.key} className={styles.checkRow}>
          <input
            type="checkbox"
            checked={overlays[row.key]}
            onChange={(e) => onToggle(row.key, e.target.checked)}
          />
          <span>{row.label}</span>
        </label>
      ))}
    </DebugSection>
  );
}

export default DebugOverlaysSection;
