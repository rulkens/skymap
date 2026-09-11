/**
 * DisplayPanel — the "Display" group in the left panel. Each child
 * CollapsibleSection is one render layer's display knobs.
 */
import { useState, type ReactNode } from 'react';

import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import Slider from '../../../../../src/components/common/Slider/Slider';
import {
  setPointCloudPointSize,
  setSplatScale,
  setOpacityScale,
  setMeshWireframe,
} from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import styles from './DisplayPanel.module.css';

function DisplayPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const pointSizePx = useAppSelector((s) => s.view.display.pointCloud.pointSizePx);
  const splatScale = useAppSelector((s) => s.view.display.gaussianSplat.splatScale);
  const opacityScale = useAppSelector((s) => s.view.display.gaussianSplat.opacityScale);
  const meshWireframe = useAppSelector((s) => s.view.display.mesh.wireframe);
  // No open/close slice for panel sections yet (see mcpm-workbench's ControlsPanel) —
  // local flags are enough until a section's state must persist.
  const [displayOpen, setDisplayOpen] = useState(true);
  const [pointCloudOpen, setPointCloudOpen] = useState(true);
  const [gaussianSplatOpen, setGaussianSplatOpen] = useState(true);
  const [meshOpen, setMeshOpen] = useState(true);

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
      <CollapsibleSection
        title="Gaussian splats"
        open={gaussianSplatOpen}
        onToggle={() => setGaussianSplatOpen((v) => !v)}
        variant="nested"
      >
        <Slider
          label="Splat scale"
          min={0.1}
          max={3}
          step={0.05}
          value={splatScale}
          onChange={(v) => dispatch(setSplatScale(v))}
        />
        <Slider
          label="Opacity scale"
          min={0}
          max={2}
          step={0.05}
          value={opacityScale}
          onChange={(v) => dispatch(setOpacityScale(v))}
        />
      </CollapsibleSection>
      <CollapsibleSection
        title="Mesh"
        open={meshOpen}
        onToggle={() => setMeshOpen((v) => !v)}
        variant="nested"
      >
        <label className={styles.toggleLabel}>
          <span>Wireframe</span>
          <input
            type="checkbox"
            className={styles.checkbox}
            aria-label="Wireframe"
            checked={meshWireframe}
            onChange={(e) => dispatch(setMeshWireframe(e.target.checked))}
          />
        </label>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default DisplayPanel;
