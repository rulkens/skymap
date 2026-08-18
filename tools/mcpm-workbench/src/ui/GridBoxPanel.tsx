/**
 * GridBoxPanel — auto-fit vs. manual grid-box configuration. Manual mode
 * takes center + size + long-axis resolution, NEVER free dims: Viewport
 * routes both modes through `autoFitGridBox` (auto-fit derives bounds from
 * the catalog bbox; manual derives them from center±size/2), so the cubic-
 * voxel invariant can't be typed away by this panel. This panel only edits
 * the target knobs — it holds no catalog data, so it can't compute a box
 * itself; Viewport watches these fields and rebuilds.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
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
import Toggle from './Toggle';

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

function VecInput({
  value,
  onChange,
}: {
  readonly value: Vec3;
  readonly onChange: (v: Vec3) => void;
}): ReactNode {
  return (
    <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <input
          key={axis}
          type="number"
          style={fieldStyle}
          value={value[i]}
          onChange={(e) => {
            const next: Vec3 = [...value];
            next[i] = parseFloat(e.target.value);
            onChange(next);
          }}
        />
      ))}
    </span>
  );
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
      <Toggle
        label="auto-fit"
        on={grid.autoFit}
        onToggle={() => store.setState((s) => ({ ...s, grid: setAutoFit(s.grid, !s.grid.autoFit) }))}
      />
      {grid.autoFit ? (
        <>
          <label>
            long-axis target
            <input
              type="number"
              style={fieldStyle}
              value={grid.longAxisTarget}
              onChange={(e) =>
                store.setState((s) => ({
                  ...s,
                  grid: setLongAxisTarget(s.grid, parseInt(e.target.value, 10)),
                }))
              }
            />
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
          <label>
            center (Mpc)
            <VecInput
              value={grid.manualCenterMpc}
              onChange={(v) =>
                store.setState((s) => ({ ...s, grid: setManualCenterMpc(s.grid, v) }))
              }
            />
          </label>
          <label>
            size (Mpc)
            <VecInput
              value={grid.manualSizeMpc}
              onChange={(v) => store.setState((s) => ({ ...s, grid: setManualSizeMpc(s.grid, v) }))}
            />
          </label>
          <label>
            long-axis resolution
            <input
              type="number"
              style={fieldStyle}
              value={grid.manualResolution}
              onChange={(e) =>
                store.setState((s) => ({
                  ...s,
                  grid: setManualResolution(s.grid, parseInt(e.target.value, 10)),
                }))
              }
            />
          </label>
        </>
      )}
    </div>
  );
}

export default GridBoxPanel;
