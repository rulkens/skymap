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

// Estimated bytes for the three storage-backed grids the sim allocates
// (depositA/depositB/trace — createGridBuffers.ts); mirrors planGridBudget's
// `3 * gridBytes` term but skips the agent-lane term, which scales with
// agentCount, not box resolution, and stays tiny at any real grid size — a
// live per-drag estimate has no cheap access to the resolved GPUSupportedLimits
// planGridBudget needs anyway. `resolvedElement` only changes with hardware
// capability, not box edits, so this doesn't go stale mid-drag the way
// `grid.byteBudget` (last COMPLETED build) would.
function estimateGridBytes(dims: Vec3, element: 'f16' | 'f32' | null): number {
  const voxels = dims[0] * dims[1] * dims[2];
  return 3 * voxels * BYTES_PER_ELEMENT[element ?? 'f32'];
}

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
  const box = deriveGridBox(grid);

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
        {formatBytes(estimateGridBytes(box.dims, grid.resolvedElement))}
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
          value={grid.manualVoxelSizeMpc}
          min={VOXEL_SIZE_MIN_MPC}
          max={VOXEL_SIZE_MAX_MPC}
          step={VOXEL_SIZE_STEP_MPC}
          format={(v) => v.toFixed(2)}
          info="Physical size of one sim voxel (Mpc) — the grid's resolution, stable under box resize/refit."
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
