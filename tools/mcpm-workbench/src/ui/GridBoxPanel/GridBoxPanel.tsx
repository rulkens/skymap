/**
 * GridBoxPanel — grid-box configuration. Both modes share ONE voxel size:
 * Viewport and this panel's size sliders both call `deriveGridBox`, so they
 * can't disagree. This panel holds no catalog data, so Auto fit reads the
 * cached `catalog.catalogBoundsMpc` rather than re-deriving from raw positions.
 * "Auto fit" (`fitBoxToCatalog`, gridSlice.ts) is a one-shot ACTION, not a
 * mode: it snapshots bounds into the manual center/size fields once,
 * `paddingMpc` baked in at click time — after that it's an ordinary manual
 * box. Below 100%, `resolveAutoFitBounds` swaps in the densest-fraction
 * bounds (`autoFitPercent`, gridSlice.ts) before that same snapshot.
 */
import type { ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import { deriveGridBox } from '../../field/deriveGridBox';
import { keptCountFor } from '../../field/keptCountFor';
import { BYTES_PER_ELEMENT } from '../../sim/createGridBuffers';
import { minFeasibleVoxelSizeMpc } from '../../sim/minFeasibleVoxelSizeMpc';
import {
  fitBoxToCatalog,
  setAutoFitPercent,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
  setVoxelSizeMpc,
} from '../../state/grid/gridSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import ButtonTip from '../ButtonTip/ButtonTip';
import PanelRow from '../PanelRow/PanelRow';
import SubsectionGroup from '../ControlsPanel/SubsectionGroup';
import SliderRow from '../SliderRow/SliderRow';
import { AXES } from './utils/AXES';
import { formatAxisSize } from './utils/formatAxisSize';
import { resolveAutoFitBounds } from './utils/resolveAutoFitBounds';
import { sizeAfterSliderEdit } from './utils/sizeAfterSliderEdit';
import { sizeSliderFor } from './utils/sizeSliderFor';
import { VOXEL_SIZE_MAX_MPC } from './utils/VOXEL_SIZE_MAX_MPC';
import { VOXEL_SIZE_MIN_MPC } from './utils/VOXEL_SIZE_MIN_MPC';
import { VOXEL_SIZE_STEP_MPC } from './utils/VOXEL_SIZE_STEP_MPC';
import { withAxis } from './utils/withAxis';
import styles from './GridBoxPanel.module.css';

function GridBoxPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const grid = useAppSelector((s) => s.grid);
  const catalogBoundsMpc = useAppSelector((s) => s.catalog.catalogBoundsMpc);
  const catalogPoints = useAppSelector((s) => s.catalog.points);
  const catalogPointCount = useAppSelector((s) => s.catalog.pointCount);
  // Display-only: how many catalog points the current slider position would evict on
  // the next Auto fit click. Derived here, not stored — `autoFitPercent` is a one-shot
  // input to that click, with no bearing on the box already showing (gridSlice.ts).
  const evictedCount =
    grid.autoFitPercent >= 100
      ? 0
      : catalogPointCount - keptCountFor(catalogPointCount, grid.autoFitPercent / 100);
  const box = deriveGridBox(grid);
  // V2: the live floor for THIS box's extent — same clamp deriveGridBox applies, computed
  // here only to drive the slider's `min` (the readout above already reflects the clamp,
  // since `box` came from deriveGridBox). Static 0.25 fallback pre-init / on a coarse box.
  // Fix round 1: `Infinity` (no voxel size fits — see minFeasibleVoxelSizeMpc's doc comment)
  // is treated as "no usable floor" too, same as null, so it never becomes the slider's min.
  const rawLiveFloorMpc =
    grid.maxBufferBytes === null
      ? null
      : minFeasibleVoxelSizeMpc(
          grid.manualSizeMpc,
          BYTES_PER_ELEMENT[grid.resolvedElement ?? 'f32'], // deriveGridBox's fallback; must match
          grid.maxBufferBytes,
        );
  const liveFloorMpc =
    rawLiveFloorMpc !== null && Number.isFinite(rawLiveFloorMpc) ? rawLiveFloorMpc : null;
  const voxelSizeMinMpc =
    liveFloorMpc === null || liveFloorMpc < VOXEL_SIZE_MIN_MPC ? VOXEL_SIZE_MIN_MPC : liveFloorMpc;
  const voxelSizeInfo =
    liveFloorMpc !== null && liveFloorMpc > VOXEL_SIZE_MIN_MPC
      ? `Edge of one sim voxel: the grid's resolution, kept when the box is resized or refit. Min for this box: ${liveFloorMpc.toFixed(2)} Mpc.`
      : "Edge of one sim voxel: the grid's resolution, kept when the box is resized or refit.";

  return (
    <>
      <SliderRow
        label="voxel size"
        // Fix round 1: `box.voxelSizeMpc` (the CLAMPED value, equal to manualVoxelSizeMpc
        // whenever the floor isn't active) rather than the raw manual value — otherwise,
        // below the floor, the pill's number disagreed with the size sliders' voxel counts
        // and arrow-key nudges silently ticked a value the display never moved for.
        value={box.voxelSizeMpc}
        min={voxelSizeMinMpc}
        max={VOXEL_SIZE_MAX_MPC}
        step={VOXEL_SIZE_STEP_MPC}
        format={(v) => `${v.toFixed(2)} Mpc`}
        info={voxelSizeInfo}
        onChange={(v) => dispatch(setVoxelSizeMpc(v))}
        path="grid.manualVoxelSizeMpc"
      />
      {AXES.map(({ axis, label }) => (
        <SliderRow
          key={`size-${label}`}
          label={`size ${label}`}
          {...sizeSliderFor(box, axis)}
          format={(v) => formatAxisSize(v, box.dims[axis])}
          info="Extent of the box along this axis: voxels × voxel size, in whole 8-voxel blocks."
          onChange={(v) => dispatch(setManualSizeMpc(sizeAfterSliderEdit(box, axis, v)))}
          path={`grid.manualSizeMpc.${axis}`}
        />
      ))}
      {AXES.map(({ axis, label }) => (
        <SliderRow
          key={`center-${label}`}
          label={`center ${label}`}
          value={grid.manualCenterMpc[axis]}
          min={-500}
          max={500}
          step={1}
          format={(v) => `${v.toFixed(0)} Mpc`}
          info="Centre of the simulated box along this axis."
          onChange={(v) => dispatch(setManualCenterMpc(withAxis(grid.manualCenterMpc, axis, v)))}
          path={`grid.manualCenterMpc.${axis}`}
        />
      ))}
      <SubsectionGroup title="Auto fit">
        <SliderRow
          label="fit %"
          value={grid.autoFitPercent}
          min={80}
          max={100}
          step={1}
          format={(v) => v.toFixed(0)}
          info="Fraction of catalog points the next Auto fit keeps, evicting the farthest-from-median fringe."
          onChange={(v) => dispatch(setAutoFitPercent(v))}
          path="grid.autoFitPercent"
        />
        {/* Always rendered, so dragging fit % never moves the rows under the pointer. */}
        <PanelRow
          label={evictedCount > 0 ? `evicts ${evictedCount.toLocaleString()} pts` : 'keeps all pts'}
        />
        <PanelRow
          label="padding (Mpc)"
          info="Margin added on every side when Auto fit sets the box."
        >
          <input
            type="number"
            className={styles.field}
            value={grid.paddingMpc}
            onChange={(e) => dispatch(setPaddingMpc(parseFloat(e.target.value)))}
          />
        </PanelRow>
        <PanelRow>
          <ButtonTip tip="Fits the box around the fit % of catalog points it keeps, plus the padding on every side.">
            {(describedBy) => (
              <Button
                className={styles.autoFitButton}
                aria-describedby={describedBy}
                disabled={!catalogBoundsMpc}
                onClick={() => {
                  if (!catalogBoundsMpc) return;
                  dispatch(
                    fitBoxToCatalog(
                      resolveAutoFitBounds(catalogPoints, catalogBoundsMpc, grid.autoFitPercent),
                    ),
                  );
                }}
              >
                auto fit
              </Button>
            )}
          </ButtonTip>
        </PanelRow>
      </SubsectionGroup>
    </>
  );
}

export default GridBoxPanel;
