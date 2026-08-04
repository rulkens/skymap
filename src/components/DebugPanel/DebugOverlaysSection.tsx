// src/components/DebugPanel/DebugOverlaysSection.tsx
/**
 * DebugOverlaysSection — checkbox list for the renderer's raw debug overlays.
 *
 * "Show pick buffer" paints the picker's colour-mapped RGBA layer over the
 * tone-mapped frame; "Show disk radius ring" outlines each famous-galaxy
 * thumbnail's disk-radius footprint; "Show orbit-trail impostor" draws the
 * ribbon impostor's hull as a flat fill tint over the real trails. All three used
 * to sit as bare `<label>`s directly in `DebugPanel` — this section gives
 * them the same collapsible chrome as the panel's other toggle groups.
 */

import DebugSection from './DebugSection';
import styles from './DebugOverlaysSection.module.css';

export type DebugOverlaysSectionProps = {
  readonly showPickBuffer: boolean;
  readonly onShowPickBufferChange: (enabled: boolean) => void;
  readonly showDiskRadiusRing: boolean;
  readonly onShowDiskRadiusRingChange: (enabled: boolean) => void;
  readonly showOrbitTrailImpostor: boolean;
  readonly onShowOrbitTrailImpostorChange: (enabled: boolean) => void;
};

function DebugOverlaysSection({
  showPickBuffer,
  onShowPickBufferChange,
  showDiskRadiusRing,
  onShowDiskRadiusRingChange,
  showOrbitTrailImpostor,
  onShowOrbitTrailImpostorChange,
}: DebugOverlaysSectionProps) {
  return (
    <DebugSection title="Debug Overlays">
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={showPickBuffer}
          onChange={(e) => onShowPickBufferChange(e.target.checked)}
        />
        <span>Show pick buffer</span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={showDiskRadiusRing}
          onChange={(e) => onShowDiskRadiusRingChange(e.target.checked)}
        />
        <span>Show disk radius ring</span>
      </label>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={showOrbitTrailImpostor}
          onChange={(e) => onShowOrbitTrailImpostorChange(e.target.checked)}
        />
        <span>Show orbit-trail impostor</span>
      </label>
    </DebugSection>
  );
}

export default DebugOverlaysSection;
