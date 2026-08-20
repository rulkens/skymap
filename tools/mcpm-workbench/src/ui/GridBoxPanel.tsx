/**
 * GridBoxPanel — grid-box configuration. Both modes share ONE voxel size
 * (never free dims): Viewport and this panel's dims readout both call
 * `deriveGridBox`, so they can't disagree. This panel holds no catalog
 * data, so the readout reads the cached `catalog.catalogBoundsMpc` instead
 * of re-deriving from raw positions.
 *
 * "Auto fit" is a one-shot ACTION (`fitBoxToCatalog`, gridSlice.ts), not a
 * persistent mode: clicking it snapshots the current catalog bounds into
 * the manual center/size fields below, `paddingMpc` baked in at click
 * time — the padding slider is an input to the NEXT fit, not a live
 * modifier of whatever box is already showing. After the click the box is
 * an ordinary manual one, editable the same as any hand-tuned box; the
 * manual sliders also feed Viewport's box-preview timer, which watches the
 * same store fields directly — no wiring needed here.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import Button from '../../../../src/components/common/Button/Button';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import { deriveGridBox } from '../field/deriveGridBox';
import { BYTES_PER_ELEMENT } from '../sim/createGridBuffers';
import { minFeasibleVoxelSizeMpc } from '../sim/minFeasibleVoxelSizeMpc';
import { estimateGridBudgetBytes } from '../sim/planGridBudget';
import { useStore } from '../state/useStore';
import {
  fitBoxToCatalog,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
  setShowGridBox,
  setVoxelSizeMpc,
} from '../state/slices/gridSlice';
import { useAppStore } from './storeContext';
import { formatBytes } from './formatBytes';
import ToggleRow from './ToggleRow';
import styles from './GridBoxPanel.module.css';

// Range and log-scale intent per the grid-voxel-size-currency decision record
// (Q3): ParamSlider/Slider have no log-scale mode (checked — neither takes a
// `scale` prop), so this is linear with a fine-ish fixed step instead.
const VOXEL_SIZE_MIN_MPC = 0.25;
const VOXEL_SIZE_MAX_MPC = 4;
const VOXEL_SIZE_STEP_MPC = 0.05;

// Literal-typed axis index (not a `.map` callback index, which noUncheckedIndexedAccess
// would widen to `number` and turn every `vec[axis]` read into `number | undefined`).
const AXES: readonly { readonly axis: 0 | 1 | 2; readonly label: 'x' | 'y' | 'z' }[] = [
  { axis: 0, label: 'x' },
  { axis: 1, label: 'y' },
  { axis: 2, label: 'z' },
];

const fieldStyle: CSSProperties = {
  width: '64px',
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--font-size-md)',
  background: 'var(--surface-control)',
  border: '1px solid var(--border-control)',
  borderRadius: '3px',
  color: 'var(--color-fg-base)',
  padding: 'var(--space-2)',
};

const dimsReadoutStyle: CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-fg-muted)',
};

function withAxis(vec: Vec3, axis: number, value: number): Vec3 {
  const next: Vec3 = [...vec];
  next[axis] = value;
  return next;
}

function GridBoxPanel(): ReactNode {
  const store = useAppStore();
  const grid = useStore(store, (s) => s.grid);
  const catalogBoundsMpc = useStore(store, (s) => s.catalog.catalogBoundsMpc);
  const agentCount = useStore(store, (s) => s.sim.agentCount);
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
        onChange={(on) => store.setState((s) => ({ ...s, grid: setShowGridBox(s.grid, on) }))}
      />
      <Button
        className={styles.autoFitButton}
        disabled={!catalogBoundsMpc}
        onClick={() => {
          if (!catalogBoundsMpc) return;
          store.setState((s) => ({ ...s, grid: fitBoxToCatalog(s.grid, catalogBoundsMpc) }));
        }}
      >
        auto fit
      </Button>
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
          onChange={(e) =>
            store.setState((s) => ({
              ...s,
              grid: setPaddingMpc(s.grid, parseFloat(e.target.value)),
            }))
          }
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
          onChange={(v) => store.setState((s) => ({ ...s, grid: setVoxelSizeMpc(s.grid, v) }))}
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
            onChange={(v) =>
              store.setState((s) => ({
                ...s,
                grid: setManualCenterMpc(s.grid, withAxis(s.grid.manualCenterMpc, axis, v)),
              }))
            }
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
            onChange={(v) =>
              store.setState((s) => ({
                ...s,
                grid: setManualSizeMpc(s.grid, withAxis(s.grid.manualSizeMpc, axis, v)),
              }))
            }
            path={`grid.manualSizeMpc.${axis}`}
          />
        ))}
      </div>
    </div>
  );
}

export default GridBoxPanel;
