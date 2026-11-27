/**
 * SurfaceSitesSection — the DebugPanel's "Surface sites" board: a live seat height for the focused
 * body standing on a surface (a rover, a probe sphere, Søndermarken). The row stays in place,
 * disabled, while no such body is focused. Props only; the container owns the store reach.
 */

import { memo, type ReactNode } from 'react';
import DebugSection from '../DebugSection';
import DebugSlider from '../DebugSlider';

export type SurfaceSitesSectionProps = {
  /** The focused surface body's name, or null when the focus is not one. */
  readonly siteLabel: string | null;
  readonly seatOffsetM: number;
  readonly onSeatOffsetChange: (seatOffsetM: number) => void;
};

function SurfaceSitesSection({
  siteLabel,
  seatOffsetM,
  onSeatOffsetChange,
}: SurfaceSitesSectionProps): ReactNode {
  return (
    <DebugSection title="Surface sites">
      <DebugSlider
        label="Seat offset"
        detail={siteLabel ?? 'none focused'}
        disabled={siteLabel === null}
        value={seatOffsetM}
        min={-0.5}
        max={0.5}
        step={0.01}
        readout={`${seatOffsetM.toFixed(2)} m`}
        onChange={onSeatOffsetChange}
        info="Raises or lowers the focused rover, probe sphere or scene on its ground, in metres, on top of its baked ground height. Focus one to tune it. The camera keeps orbiting the unmoved spot."
      />
    </DebugSection>
  );
}

export default memo(SurfaceSitesSection);
