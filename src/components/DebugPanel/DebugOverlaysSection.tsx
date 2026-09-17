// src/components/DebugPanel/DebugOverlaysSection.tsx
/**
 * DebugOverlaysSection — checkbox list for the renderer's raw debug
 * overlays, row-driven from `DEBUG_OVERLAY_ROWS` (see that table for what
 * each toggle does).
 */

import { DEBUG_OVERLAY_ROWS } from '../../data/debug/debugOverlayRows';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';
import DebugOverlayToggles from './DebugOverlayToggles';
import DebugSection from './DebugSection';

/** Everything not claimed by a `section` — this list is the default home. */
const UNSECTIONED_ROWS = DEBUG_OVERLAY_ROWS.filter((row) => !('section' in row));

export type DebugOverlaysSectionProps = {
  readonly overlays: Record<DebugOverlayKey, boolean>;
  readonly onToggle: (key: DebugOverlayKey, enabled: boolean) => void;
};

function DebugOverlaysSection({ overlays, onToggle }: DebugOverlaysSectionProps) {
  return (
    <DebugSection title="Debug Overlays">
      <DebugOverlayToggles rows={UNSECTIONED_ROWS} overlays={overlays} onToggle={onToggle} />
    </DebugSection>
  );
}

export default DebugOverlaysSection;
