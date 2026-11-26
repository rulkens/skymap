/**
 * SelectionControls — the Selection box's controls. Viewport and these size sliders
 * both call `deriveGridBox`, so they can't disagree about the box. Auto fit
 * (`fitBoxToCatalog`) is a one-shot ACTION, not a mode: it snapshots the cached
 * catalog bounds (or, below 100%, the densest fraction's) into the manual center
 * and size once, padding baked in; after that it is an ordinary manual box.
 */
import { useState, type ReactNode } from 'react';
import Button from '../../../../../../src/components/common/Button/Button';
import type { Vec3 } from '../../../../../../src/@types/math/Vec3';
import type { CatalogSlice } from '../../../../@types/catalog/CatalogSlice';
import type { GridSlice } from '../../../../@types/grid/GridSlice';
import { deriveGridBox } from '../../../grid/deriveGridBox';
import { keptCountFor } from '../../../grid/autoFit/keptCountFor';
import { voxelSizeFloorMpc } from '../../../grid/voxelSize/voxelSizeFloorMpc';
import ButtonTip from '../../panel/ButtonTip/ButtonTip';
import PanelRow from '../../panel/PanelRow/PanelRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { LOG10_DISPLAYED } from '../../panel/data/log10Displayed.constant';
import SliderRow from '../../panel/SliderRow/SliderRow';
import SliderRows from '../../panel/SliderRows/SliderRows';
import { AXES } from '../../panel/data/axes.constant';
import { AUTO_FIT_SLIDER_FIELDS } from './data/autoFitSliderFields.constant';
import { centerSliderFor } from './utils/centerSliderFor';
import { formatAxisSize } from './utils/formatAxisSize';
import { formatVoxelSizeMpc } from '../../../utils/format/formatVoxelSizeMpc';
import { sizeAfterSliderEdit } from './utils/sizeAfterSliderEdit';
import { sizeSliderFor } from './utils/sizeSliderFor';
import { VOXEL_SIZE_INFO } from './data/voxelSizeInfo.constant';
import { VOXEL_SIZE_MIN_MPC } from './data/voxelSizeMinMpc.constant';
import { voxelSizeSliderFor } from './utils/voxelSizeSliderFor';
import { withAxis } from '../../../../../../src/utils/math/withAxis';
import styles from './SelectionControls.module.css';

export type SelectionControlsProps = {
  readonly grid: GridSlice;
  readonly catalogBoundsMpc: CatalogSlice['catalogBoundsMpc'];
  readonly catalogPointCount: number;
  readonly onVoxelSizeChange: (voxelSizeMpc: number) => void;
  readonly onSizeChange: (sizeMpc: Vec3) => void;
  readonly onCenterChange: (centerMpc: Vec3) => void;
  readonly onAutoFitPercentChange: (percent: number) => void;
  readonly onPaddingChange: (paddingMpc: number) => void;
  /** Only called while `catalogBoundsMpc` is set. */
  readonly onAutoFit: () => void;
};

function SelectionControls({
  grid,
  catalogBoundsMpc,
  catalogPointCount,
  onVoxelSizeChange,
  onSizeChange,
  onCenterChange,
  onAutoFitPercentChange,
  onPaddingChange,
  onAutoFit,
}: SelectionControlsProps): ReactNode {
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
        onChange={(v) => onVoxelSizeChange(10 ** v)}
        path="grid.manualVoxelSizeMpc"
      />
      {AXES.map(({ axis, label }) => (
        <SliderRow
          key={`size-${label}`}
          label={`size ${label}`}
          {...sizeSliderFor(box, axis)}
          format={(v) => formatAxisSize(v, box.dims[axis])}
          info="Extent of the box along this axis: voxels × voxel size, in whole 8-voxel blocks."
          onChange={(v) => onSizeChange(sizeAfterSliderEdit(grid, axis, v))}
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
          onChange={(v) => onCenterChange(withAxis(grid.manualCenterMpc, axis, v))}
          path={`grid.manualCenterMpc.${axis}`}
        />
      ))}
      <SubsectionGroup title="Auto fit">
        <SliderRows
          fields={AUTO_FIT_SLIDER_FIELDS}
          values={grid}
          path="grid"
          onChange={(_, value) => onAutoFitPercentChange(value)}
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
              onPaddingChange(e.target.valueAsNumber);
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
                onClick={onAutoFit}
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

export default SelectionControls;
