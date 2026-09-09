/**
 * DisplayPanel — the "Display" group in the left panel. Each child
 * CollapsibleSection is one render layer's display knobs; "Point cloud" is
 * the first (splats/mesh sections land later as those renderers exist).
 */
import { useState, type ReactNode } from 'react';

import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import Slider from '../../../../../src/components/common/Slider/Slider';
import { setPointCloudPointSize } from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

function DisplayPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const pointSizePx = useAppSelector((s) => s.view.display.pointCloud.pointSizePx);
  // No open/close slice for panel sections yet (see mcpm-workbench's ControlsPanel) —
  // local flags are enough until a section's state must persist.
  const [displayOpen, setDisplayOpen] = useState(true);
  const [pointCloudOpen, setPointCloudOpen] = useState(true);

  return (
    <CollapsibleSection
      title="Display"
      open={displayOpen}
      onToggle={() => setDisplayOpen((v) => !v)}
      variant="group"
    >
      <CollapsibleSection
        title="Point cloud"
        open={pointCloudOpen}
        onToggle={() => setPointCloudOpen((v) => !v)}
        variant="nested"
      >
        <Slider
          label="Point size"
          min={1}
          max={10}
          step={0.5}
          format={(v) => `${v} px`}
          value={pointSizePx}
          onChange={(v) => dispatch(setPointCloudPointSize(v))}
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default DisplayPanel;
