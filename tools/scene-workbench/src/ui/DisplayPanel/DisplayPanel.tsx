/**
 * DisplayPanel — the "Display" group in the left panel. Each child
 * CollapsibleSection is one render layer's display knobs (mesh sections
 * land later as that renderer exists).
 */
import { useState, type ReactNode } from 'react';

import CollapsibleSection from '../../../../../src/components/common/CollapsibleSection/CollapsibleSection';
import Slider from '../../../../../src/components/common/Slider/Slider';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { BoundsM } from '../../../@types/BoundsM';
import type { SplatMetrics } from '../../state/group/groupSlice';
import {
  setPointCloudPointSize,
  setSplatClipBox,
  setSplatScale,
  setOpacityScale,
} from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import styles from './DisplayPanel.module.css';

const AXES = ['X', 'Y', 'Z'] as const;

/** One box governs every splat asset in the group, so the sliders span their
 *  union and the readout sums them. `null` until the first sort has reported:
 *  before that there is no extent to range a slider against. */
function totalSplatMetrics(byAsset: Record<string, SplatMetrics>): SplatMetrics | null {
  let total: SplatMetrics | null = null;
  for (const asset of Object.values(byAsset)) {
    if (total === null) {
      total = asset;
      continue;
    }
    total = {
      boundsM: {
        min: total.boundsM.min.map((v, i) => Math.min(v, asset.boundsM.min[i]!)) as Vec3,
        max: total.boundsM.max.map((v, i) => Math.max(v, asset.boundsM.max[i]!)) as Vec3,
      },
      drawCount: total.drawCount + asset.drawCount,
      splatCount: total.splatCount + asset.splatCount,
    };
  }
  return total;
}

/** Keeps the box from inverting: a min dragged past its max would cull every
 *  splat, and that slider could not then drag its way back out. */
function withEdge(box: BoundsM, axis: number, edge: 'min' | 'max', valueM: number): BoundsM {
  const min: Vec3 = [box.min[0], box.min[1], box.min[2]];
  const max: Vec3 = [box.max[0], box.max[1], box.max[2]];
  if (edge === 'min') min[axis] = Math.min(valueM, max[axis]!);
  else max[axis] = Math.max(valueM, min[axis]!);
  return { min, max };
}

function DisplayPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const pointSizePx = useAppSelector((s) => s.view.display.pointCloud.pointSizePx);
  const splatScale = useAppSelector((s) => s.view.display.gaussianSplat.splatScale);
  const opacityScale = useAppSelector((s) => s.view.display.gaussianSplat.opacityScale);
  const clipBoxM = useAppSelector((s) => s.view.display.gaussianSplat.clipBoxM);
  const splats = totalSplatMetrics(useAppSelector((s) => s.group.splatMetrics));
  // No open/close slice for panel sections yet (see mcpm-workbench's ControlsPanel) —
  // local flags are enough until a section's state must persist.
  const [displayOpen, setDisplayOpen] = useState(true);
  const [pointCloudOpen, setPointCloudOpen] = useState(true);
  const [gaussianSplatOpen, setGaussianSplatOpen] = useState(true);

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
        {splats !== null && (
          <>
            <label className={styles.toggleLabel}>
              <span>Clip box</span>
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label="Clip box"
                checked={clipBoxM !== null}
                onChange={() =>
                  dispatch(setSplatClipBox(clipBoxM === null ? splats.boundsM : null))
                }
              />
            </label>
            {clipBoxM !== null &&
              AXES.flatMap((name, axis) =>
                (['min', 'max'] as const).map((edge) => (
                  <Slider
                    key={`${name}-${edge}`}
                    label={`${name} ${edge}`}
                    min={splats.boundsM.min[axis]!}
                    max={splats.boundsM.max[axis]!}
                    step={1}
                    format={(v) => `${Math.round(v)} m`}
                    value={clipBoxM[edge][axis]!}
                    onChange={(v) => dispatch(setSplatClipBox(withEdge(clipBoxM, axis, edge, v)))}
                  />
                )),
              )}
            <div className={styles.readout}>
              {splats.drawCount.toLocaleString()} / {splats.splatCount.toLocaleString()} splats
            </div>
          </>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default DisplayPanel;
