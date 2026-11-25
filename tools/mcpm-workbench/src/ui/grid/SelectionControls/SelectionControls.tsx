/**
 * GridBoxPanel — grid-box configuration. Both modes share ONE voxel size:
 * Viewport and this panel's size sliders both call `deriveGridBox`, so they
 * can't disagree. This panel holds no catalog data, so Auto fit reads the
 * cached `catalog.catalogBoundsMpc` rather than re-deriving from raw positions.
 * "Auto fit" (`fitBoxToCatalog`, gridSlice.ts) is a one-shot ACTION, not a
 * mode: it snapshots bounds into the manual center/size fields once,
 * `paddingMpc` baked in at click time — after that it's an ordinary manual
 * box. It keeps the voxel size unless the fitted box would not fit GPU memory,
 * and then only raises it. Below 100%, `resolveAutoFitBounds` swaps in the densest-fraction
 * bounds (`autoFitPercent`, gridSlice.ts) before that same snapshot.
 */
import { useState, type ReactNode } from 'react';
import Button from '../../../../../../src/components/common/Button/Button';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import { keptCountFor } from '../../../grid/autoFit/keptCountFor';
import { voxelSizeFloorMpc } from '../../../grid/voxelSize/voxelSizeFloorMpc';
import {
  fitBoxToCatalog,
  setAutoFitPercent,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
  setVoxelSizeMpc,
} from '../../../state/grid/gridSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import PanelRow from '../../panel/PanelRow/PanelRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { LOG10_DISPLAYED } from '../../panel/data/log10Displayed.constant';
import SliderRow from '../../panel/SliderRow/SliderRow';
import { AXES } from '../../panel/data/axes.constant';
import { centerSliderFor } from './utils/centerSliderFor';
import { formatAxisSize } from './utils/formatAxisSize';
import { formatVoxelSizeMpc } from '../../../utils/format/formatVoxelSizeMpc';
import { resolveAutoFitBounds } from '../../../grid/autoFit/resolveAutoFitBounds';
import { sizeAfterSliderEdit } from './utils/sizeAfterSliderEdit';
import { sizeSliderFor } from './utils/sizeSliderFor';
import { VOXEL_SIZE_INFO } from './data/voxelSizeInfo.constant';
import { VOXEL_SIZE_MIN_MPC } from './data/voxelSizeMinMpc.constant';
import { voxelSizeSliderFor } from './utils/voxelSizeSliderFor';
import { withAxis } from './utils/withAxis';
import styles from './SelectionControls.module.css';

function GridBoxPanel(): ReactNode {
  const dispatch = useAppDispatch();
  const grid = useAppSelector((s) => s.grid);
  const catalogBoundsMpc = useAppSelector((s) => s.catalog.catalogBoundsMpc);
  const catalogPoints = useAppSelector((s) => s.catalog.points);
  const catalogPointCount = useAppSelector((s) => s.catalog.pointCount);
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  const [paddingText, setPaddingText] = useState<string | null>(null);
  // Display-only: how many catalog points the current slider position would evict on
  // the next Auto fit click. Derived here, not stored — `autoFitPercent` is a one-shot
  // input to that click, with no bearing on the box already showing (gridSlice.ts).
  const evictedCount =
    grid.autoFitPercent >= 100
      ? 0
      : catalogPointCount - keptCountFor(catalogPointCount, grid.autoFitPercent / 100);
  const box = deriveGridBox(grid);
  const liveFloorMpc = voxelSizeFloorMpc(grid);
  const voxelSizeInfo =
    liveFloorMpc !== null && liveFloorMpc > VOXEL_SIZE_MIN_MPC
      ? `${VOXEL_SIZE_INFO} Min for this box: ${liveFloorMpc.toFixed(2)} Mpc.`
      : VOXEL_SIZE_INFO;

  return (
    <>
      <SliderRow
        label="voxel size"
        // Log10 at this boundary only: the store keeps Mpc.
        {...voxelSizeSliderFor(grid)}
        format={(v) => formatVoxelSizeMpc(10 ** v)}
        displayed={LOG10_DISPLAYED}
        info={voxelSizeInfo}
        onChange={(v) => dispatch(setVoxelSizeMpc(10 ** v))}
        path="grid.manualVoxelSizeMpc"
      />
      {AXES.map(({ axis, label }) => (
        <SliderRow
          key={`size-${label}`}
          label={`size ${label}`}
          {...sizeSliderFor(box, axis)}
          format={(v) => formatAxisSize(v, box.dims[axis])}
          info="Extent of the box along this axis: voxels × voxel size, in whole 8-voxel blocks."
          onChange={(v) => dispatch(setManualSizeMpc(sizeAfterSliderEdit(grid, axis, v)))}
          path={`grid.manualSizeMpc.${axis}`}
        />
      ))}
      {AXES.map(({ axis, label }) => (
        <SliderRow
          key={`center-${label}`}
          label={`center ${label}`}
          {...centerSliderFor(grid, catalogBoundsMpc, axis)}
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
          {/* Holds its own text while focused, so it can be cleared mid-edit; the store
              refuses what isn't a padding and keeps the last one that was. */}
          <input
            type="number"
            min={0}
            className={styles.field}
            value={paddingText ?? grid.paddingMpc}
            aria-invalid={
              paddingText !== null &&
              (paddingText.trim() === '' || Number(paddingText) !== grid.paddingMpc)
            }
            onChange={(e) => {
              setPaddingText(e.target.value);
              dispatch(setPaddingMpc(e.target.valueAsNumber));
            }}
            onBlur={() => setPaddingText(null)}
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
                    fitBoxToCatalog({
                      bounds: resolveAutoFitBounds(
                        catalogPoints,
                        catalogBoundsMpc,
                        grid.autoFitPercent,
                      ),
                      lanes: { agentCount, pointCount: catalogPointCount },
                    }),
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
