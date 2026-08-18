/**
 * GridBoxPanel — auto-fit vs. manual grid-box configuration. Both modes
 * share ONE divisor (never free dims): Viewport and this panel's dims
 * readout both call `deriveGridBox`, so they can't disagree. This panel
 * holds no catalog data, so the readout reads the cached
 * `catalog.catalogBoundsMpc` instead of re-deriving from raw positions.
 * The manual sliders also feed Viewport's box-preview timer, which
 * watches the same store fields directly — no wiring needed here.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import ParamSlider from '../../../../src/components/common/ParamSlider/ParamSlider';
import { deriveGridBox } from '../field/deriveGridBox';
import { useStore } from '../state/useStore';
import {
  setAutoFit,
  setDivisor,
  setManualCenterMpc,
  setManualSizeMpc,
  setPaddingMpc,
} from '../state/slices/gridSlice';
import { useAppStore } from './storeContext';
import ToggleRow from './ToggleRow';

// User-specified stepping: finer than 1 in quarter steps, coarser in half
// steps — a discrete list, not a uniform-step range, so Slider (fixed step)
// can't drive it; a <select> (like this row) can. 0.5 = 512 long axis, the
// finest notch below the S10-era 0.75.
const DIVISOR_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;

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

// Row chrome matches the ParamSlider rows above it (mono label left, control
// right); the select itself models the main app's GalaxiesSection
// `styles.modeSelect` chip — this tool has no shared select style of its own.
const divisorRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const divisorLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-fg-label)',
};

const divisorSelectStyle: CSSProperties = {
  flexShrink: 0,
  padding: 'var(--space-1) var(--space-3)',
  border: '1px solid var(--border-control)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface-control)',
  color: 'var(--color-fg-base)',
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--font-size-md)',
  cursor: 'pointer',
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
  const box = deriveGridBox(grid, catalogBoundsMpc);

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
      <div>
        <div style={divisorRowStyle}>
          <label htmlFor="grid-divisor" style={divisorLabelStyle}>
            grid divisor
          </label>
          <select
            id="grid-divisor"
            style={divisorSelectStyle}
            value={grid.divisor}
            onChange={(e) =>
              store.setState((s) => ({ ...s, grid: setDivisor(s.grid, Number(e.target.value)) }))
            }
          >
            {DIVISOR_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div style={dimsReadoutStyle}>
          {box
            ? `${box.dims[0]} × ${box.dims[1]} × ${box.dims[2]} vox · ${box.voxelSizeMpc.toFixed(2)} Mpc/vox`
            : 'no catalog loaded yet'}
        </div>
      </div>
      {grid.autoFit ? (
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
        </>
      )}
    </div>
  );
}

export default GridBoxPanel;
