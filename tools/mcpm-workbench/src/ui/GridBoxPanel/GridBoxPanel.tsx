/**
 * GridBoxPanel — grid-box configuration. Both modes share ONE voxel size:
 * Viewport and this panel's dims readout both call `deriveGridBox`, so they
 * can't disagree. This panel holds no catalog data, so the readout reads the
 * cached `catalog.catalogBoundsMpc` rather than re-deriving from raw positions.
 * "Auto fit" (`fitBoxToCatalog`, gridSlice.ts) is a one-shot ACTION, not a
 * mode: it snapshots bounds into the manual center/size fields once,
 * `paddingMpc` baked in at click time — after that it's an ordinary manual
 * box. Below 100%, `resolveAutoFitBounds` swaps in the densest-fraction
 * bounds (`autoFitPercent`, gridSlice.ts) before that same snapshot.
 */
import type { ReactNode } from 'react';
import Button from '../../../../../src/components/common/Button/Button';
import ParamSlider from '../../../../../src/components/common/ParamSlider/ParamSlider';
import { deriveGridBox } from '../../field/deriveGridBox';
import { keptCountFor } from '../../field/keptCountFor';
import { BYTES_PER_ELEMENT } from '../../sim/createGridBuffers';
import { minFeasibleVoxelSizeMpc } from '../../sim/minFeasibleVoxelSizeMpc';
import { estimateGridBudgetBytes } from '../../sim/planGridBudget';
import {
  fitBoxToCatalog,
  setAutoFitPercent,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
  setShowGridBox,
  setVoxelSizeMpc,
} from '../../state/grid/gridSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { formatBytes } from '../formatBytes';
import ToggleRow from '../ToggleRow/ToggleRow';
import { AXES } from './utils/AXES';
import { dimsReadoutStyle } from './utils/dimsReadoutStyle';
import { fieldStyle } from './utils/fieldStyle';
import { resolveAutoFitBounds } from './utils/resolveAutoFitBounds';
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
  const agentCount = useAppSelector((s) => s.sim.agentCount);
  // Display-only: how many catalog points the current slider position would evict on
  // the next Auto fit click. Derived here, not stored — `autoFitPercent` is a one-shot
  // input to that click, with no bearing on the box already showing (gridSlice.ts).
  const evictedCount =
    grid.autoFitPercent >= 100
      ? 0
      : catalogPointCount - keptCountFor(catalogPointCount, grid.autoFitPercent / 100);
  const box = deriveGridBox(grid);
  // Same total-bytes formula planGridBudget uses to refuse a build (one home,
  // shared) — no device limits needed here since this is a live estimate, not
  // a refusal check. `resolvedElement` only changes with hardware capability,
  // not box/agent-count edits, so this can't go stale mid-drag the way
  // `grid.byteBudget` (last COMPLETED build) would.
  // `?? 'f32'` fallback — must stay in sync with the two other copies below and in
  // deriveGridBox.ts, or this readout disagrees with the box the sim actually builds.
  const estimatedBytes = estimateGridBudgetBytes(
    box.dims,
    agentCount,
    grid.resolvedElement ?? 'f32',
  );
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
          BYTES_PER_ELEMENT[grid.resolvedElement ?? 'f32'], // same fallback contract as above
          grid.maxBufferBytes,
        );
  const liveFloorMpc =
    rawLiveFloorMpc !== null && Number.isFinite(rawLiveFloorMpc) ? rawLiveFloorMpc : null;
  const voxelSizeMinMpc =
    liveFloorMpc === null || liveFloorMpc < VOXEL_SIZE_MIN_MPC ? VOXEL_SIZE_MIN_MPC : liveFloorMpc;
  const voxelSizeInfo =
    liveFloorMpc !== null && liveFloorMpc > VOXEL_SIZE_MIN_MPC
      ? `Physical size of one sim voxel (Mpc) — the grid's resolution, stable under box resize/refit. Min for this box: ${liveFloorMpc.toFixed(2)} Mpc.`
      : "Physical size of one sim voxel (Mpc) — the grid's resolution, stable under box resize/refit.";

  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--space-4)',
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-md)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <ToggleRow
        label="show box"
        on={grid.showGridBox}
        info="Keeps the box wireframe and its drag handles on screen, instead of only the 200ms flash after a slider edit."
        onChange={(on) => dispatch(setShowGridBox(on))}
      />
      {/* Group div so the slider's own margin (not the root grid's gap) sets its
          spacing to the readout/button it controls — same principle as the
          seven-slider wrapper below, applied to this one slider+button pairing. */}
      <div>
        <ParamSlider
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
        {grid.autoFitPercent < 100 && <div style={dimsReadoutStyle}>evicts {evictedCount} pts</div>}
        <Button
          className={styles.autoFitButton}
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
      </div>
      <div style={dimsReadoutStyle}>
        {box.dims[0]} × {box.dims[1]} × {box.dims[2]} vox · {box.voxelSizeMpc.toFixed(2)} Mpc/vox ·{' '}
        {formatBytes(estimatedBytes)}
      </div>
      <label>
        padding (Mpc)
        <input
          type="number"
          style={fieldStyle}
          value={grid.paddingMpc}
          onChange={(e) => dispatch(setPaddingMpc(parseFloat(e.target.value)))}
        />
      </label>
      {/* One wrapper for all seven sliders: consecutive ParamSliders space by their
          own margin (like every other panel); the root grid's gap would double it. */}
      <div>
        <ParamSlider
          label="voxel size"
          // Fix round 1: `box.voxelSizeMpc` (the CLAMPED value, equal to manualVoxelSizeMpc
          // whenever the floor isn't active) rather than the raw manual value — otherwise,
          // below the floor, the pill's number disagreed with the dims readout above and
          // arrow-key nudges silently ticked a value the display never moved for.
          value={box.voxelSizeMpc}
          min={voxelSizeMinMpc}
          max={VOXEL_SIZE_MAX_MPC}
          step={VOXEL_SIZE_STEP_MPC}
          format={(v) => v.toFixed(2)}
          info={voxelSizeInfo}
          onChange={(v) => dispatch(setVoxelSizeMpc(v))}
          path="grid.manualVoxelSizeMpc"
        />
        {AXES.map(({ axis, label }) => (
          <ParamSlider
            key={`center-${label}`}
            label={`center ${label}`}
            value={grid.manualCenterMpc[axis]}
            min={-500}
            max={500}
            step={1}
            format={(v) => v.toFixed(0)}
            info="Centre of the simulated box (Mpc)."
            onChange={(v) => dispatch(setManualCenterMpc(withAxis(grid.manualCenterMpc, axis, v)))}
            path={`grid.manualCenterMpc.${axis}`}
          />
        ))}
        {AXES.map(({ axis, label }) => (
          <ParamSlider
            key={`size-${label}`}
            label={`size ${label}`}
            value={grid.manualSizeMpc[axis]}
            min={10}
            max={1000}
            step={5}
            format={(v) => v.toFixed(0)}
            info="Extent of the simulated box along this axis (Mpc)."
            onChange={(v) => dispatch(setManualSizeMpc(withAxis(grid.manualSizeMpc, axis, v)))}
            path={`grid.manualSizeMpc.${axis}`}
          />
        ))}
      </div>
    </div>
  );
}

export default GridBoxPanel;
