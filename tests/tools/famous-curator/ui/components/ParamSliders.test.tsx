// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamSliders } from '../../../../../tools/famous-curator/ui/components/ParamSliders';

describe('ParamSliders', () => {
  const defaults = {
    starnet: { stride: 256, upsample: false },
    alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
    dirty: { crop: false, starnet: false, alpha: false },
    processedOnce: false,
    canExport: false,
  };

  it('renders all 5 controls + 2 action buttons', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()}
        onAlpha={vi.fn()}
        onProcess={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/stride/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upsample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/black point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/white point/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gamma/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /process/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('marks Process with data-dirty=true when crop or starnet is dirty', () => {
    render(
      <ParamSliders
        {...defaults}
        dirty={{ crop: true, starnet: false, alpha: false }}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /process/i });
    expect(btn.getAttribute('data-dirty')).toBe('true');
  });

  it('disables Export when canExport=false', () => {
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('enables Export when canExport=true', () => {
    render(
      <ParamSliders
        {...defaults} canExport
        onStarnet={vi.fn()} onAlpha={vi.fn()} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled();
  });

  it('changing the gamma slider calls onAlpha with the new value', () => {
    const onAlpha = vi.fn();
    render(
      <ParamSliders
        {...defaults}
        onStarnet={vi.fn()} onAlpha={onAlpha} onProcess={vi.fn()} onExport={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/gamma/i), { target: { value: '1.2' } });
    expect(onAlpha).toHaveBeenCalledWith({ blackPoint: 8, whitePoint: 255, gamma: 1.2 });
  });
});
