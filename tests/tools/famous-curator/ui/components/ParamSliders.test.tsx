// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamSliders } from '../../../../../tools/famous-curator/ui/components/ParamSliders';

describe('ParamSliders', () => {
  const defaults = {
    starnet: { stride: 256, upsample: false },
    alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
    dirty: { crop: false, starnet: false, alpha: false, disk: false },
    canCommit: false,
    commitPhase: 'idle' as const,
  };

  it('renders all 5 controls + the Commit button', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()}
        onAlpha={vi.fn()}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/stride/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upsample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/black point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/white point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gamma/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commit/i })).toBeInTheDocument();
  });

  it('marks Commit with data-dirty=true when crop or starnet is dirty', () => {
    render(
      <ParamSliders
        {...defaults}
        dirty={{ crop: true, starnet: false, alpha: false, disk: false }}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onCommit={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /commit/i });
    expect(btn.getAttribute('data-dirty')).toBe('true');
  });

  it('disables Commit when canCommit=false', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onCommit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /commit/i })).toBeDisabled();
  });

  it('enables Commit when canCommit=true', () => {
    render(
      <ParamSliders
        {...defaults} canCommit
        onStarnet={vi.fn()} onAlpha={vi.fn()} onCommit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /commit/i })).not.toBeDisabled();
  });

  it('shows phase label and disables Commit while busy', () => {
    render(
      <ParamSliders
        {...defaults} canCommit commitPhase="exporting"
        onStarnet={vi.fn()} onAlpha={vi.fn()} onCommit={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /exporting/i });
    expect(btn).toBeDisabled();
  });

  it('changing the gamma slider calls onAlpha with the new value', () => {
    const onAlpha = vi.fn();
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={onAlpha} onCommit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/gamma/i), { target: { value: '1.2' } });
    expect(onAlpha).toHaveBeenCalledWith({ blackPoint: 8, whitePoint: 255, gamma: 1.2 });
  });
});
