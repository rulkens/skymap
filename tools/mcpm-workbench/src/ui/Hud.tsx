/**
 * Hud — the diagnostic readout the spec requires AT ALL TIMES: point count,
 * NaN-fill count and fraction, resolved GridElement, summed byte budget,
 * step counter. The NaN fraction is the one number that says what a
 * median-filled fit stands on (spec §6), so it's never hidden behind a
 * toggle. Read-only: every value comes straight off the store.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../state/useStore';
import { useAppStore } from './storeContext';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 'var(--space-6)' };
const labelStyle: CSSProperties = { color: 'var(--color-fg-label)' };
const valueStyle: CSSProperties = { color: 'var(--color-fg-base)' };

function Hud(): ReactNode {
  const store = useAppStore();
  const catalog = useStore(store, (s) => s.catalog);
  const grid = useStore(store, (s) => s.grid);
  const stepCount = useStore(store, (s) => s.sim.stepCount);

  const nanFraction = catalog.pointCount > 0 ? catalog.nanFillCount / catalog.pointCount : 0;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'var(--space-6)',
        left: 'var(--space-6)',
        display: 'grid',
        gap: 'var(--space-2)',
        padding: 'var(--space-5)',
        borderRadius: '6px',
        background: 'var(--surface-panel)',
        border: '1px solid var(--border-card)',
        fontFamily: 'var(--font-family-mono)',
        fontSize: 'var(--font-size-md)',
        minWidth: '220px',
      }}
    >
      <div style={rowStyle}>
        <span style={labelStyle}>points</span>
        <span style={valueStyle}>{catalog.pointCount.toLocaleString()}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>NaN fill</span>
        <span style={valueStyle}>
          {catalog.nanFillCount.toLocaleString()} ({(nanFraction * 100).toFixed(1)}%)
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>element</span>
        <span style={valueStyle}>{grid.resolvedElement ?? '—'}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>budget</span>
        <span style={valueStyle}>
          {grid.byteBudget ? formatBytes(grid.byteBudget.totalBytes) : '—'}
        </span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>step</span>
        <span style={valueStyle}>{stepCount.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default Hud;
