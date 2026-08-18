/**
 * GridBoxPanel — auto-fit vs. manual grid-box configuration. Manual mode
 * takes center + size + long-axis resolution, NEVER free dims: Viewport
 * routes both modes through `autoFitGridBox` (auto-fit derives bounds from
 * the catalog bbox; manual derives them from center±size/2), so the cubic-
 * voxel invariant can't be typed away by this panel. This panel only edits
 * the target knobs — it holds no catalog data, so it can't compute a box
 * itself; Viewport watches these fields and rebuilds.
 *
 * The manual center/size sliders also feed Viewport's transient box-preview
 * timer — it watches these same six store fields for a change, not this
 * component, so dragging one needs no wiring here beyond the plain setter.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import { useStore } from '../state/useStore';
import {
  setAutoFit,
  setLongAxisTarget,
  setManualCenterMpc,
  setManualResolution,
  setManualSizeMpc,
  setPaddingMpc,
} from '../state/slices/gridSlice';
import { useAppStore } from './storeContext';
import ToggleRow from './ToggleRow';

// Notches, not free text: grid memory scales cubically, so the panel offers only
// resolutions the byte budget has been sanity-checked at (360 ≈ the fork class).
const RESOLUTION_OPTIONS = [64, 128, 256, 360] as const;

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

function withAxis(vec: Vec3, axis: number, value: number): Vec3 {
  const next: Vec3 = [...vec];
  next[axis] = value;
  return next;
}

function GridBoxPanel(): ReactNode {
  const store = useAppStore();
  const grid = useStore(store, (s) => s.grid);

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
        label="auto-fit"
        on={grid.autoFit}
        onChange={(on) => store.setState((s) => ({ ...s, grid: setAutoFit(s.grid, on) }))}
      />
      {grid.autoFit ? (
        <>
          <label>
            long-axis target
            <select
              style={fieldStyle}
              value={grid.longAxisTarget}
              onChange={(e) =>
                store.setState((s) => ({
                  ...s,
                  grid: setLongAxisTarget(s.grid, parseInt(e.target.value, 10)),
                }))
              }
            >
              {RESOLUTION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
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
        </>
      ) : (
        <>
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
          <label>
            long-axis resolution
            <select
              style={fieldStyle}
              value={grid.manualResolution}
              onChange={(e) =>
                store.setState((s) => ({
                  ...s,
                  grid: setManualResolution(s.grid, parseInt(e.target.value, 10)),
                }))
              }
            >
              {RESOLUTION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export default GridBoxPanel;
