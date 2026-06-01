// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiskControls } from '../../../../../tools/famous-curator/ui/components/DiskControls';
import type { RecipeDisk } from '../../../../../tools/famous-curator/plugin/recipe';

const baseDisk: RecipeDisk = {
  centerPx: [64, 64],
  radiusPx: 32,
  paDeg: 30,
  axisRatio: 0.6,
  deproject: false,
};

describe('DiskControls', () => {
  it('renders nothing when no disk', () => {
    const { container } = render(
      <DiskControls disk={undefined} catalogAxisRatio={0.6} onDiskChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('toggling the checkbox calls onDiskChange with flipped deproject', () => {
    const onDiskChange = vi.fn();
    render(<DiskControls disk={baseDisk} catalogAxisRatio={0.6} onDiskChange={onDiskChange} />);
    const checkbox = screen.getByLabelText(/deproject to face-on/i);
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(onDiskChange).toHaveBeenCalledWith({ ...baseDisk, deproject: true });
  });

  it('keeps the toggle enabled and warns when very edge-on (forceable)', () => {
    const onDiskChange = vi.fn();
    const edgeOnDisk: RecipeDisk = { ...baseDisk, axisRatio: 0.2 };
    render(
      <DiskControls disk={edgeOnDisk} catalogAxisRatio={undefined} onDiskChange={onDiskChange} />,
    );
    const checkbox = screen.getByLabelText(/deproject to face-on/i);
    // The advisory threshold no longer disables the control — it can be forced.
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);
    expect(onDiskChange).toHaveBeenCalledWith({ ...edgeOnDisk, deproject: true });
    // A non-blocking warning shows the aggressive-stretch advisory.
    const warning = screen.getByTestId('deproject-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/very edge-on/i);
    expect(warning).toHaveTextContent('0.20');
  });

  it('shows no edge-on warning at or above the advisory threshold', () => {
    render(<DiskControls disk={baseDisk} catalogAxisRatio={0.6} onDiskChange={vi.fn()} />);
    expect(screen.queryByTestId('deproject-warning')).toBeNull();
  });
});

const base: RecipeDisk = {
  centerPx: [1, 2],
  radiusPx: 3,
  paDeg: 4,
  axisRatio: 0.5,
  deproject: true,
};

describe('DiskControls margin slider', () => {
  it('renders the slider only when deproject is on', () => {
    const { queryByTestId, rerender } = render(
      <DiskControls disk={base} catalogAxisRatio={0.5} onDiskChange={() => {}} />,
    );
    expect(queryByTestId('margin-slider')).not.toBeNull();
    rerender(
      <DiskControls
        disk={{ ...base, deproject: false }}
        catalogAxisRatio={0.5}
        onDiskChange={() => {}}
      />,
    );
    expect(queryByTestId('margin-slider')).toBeNull();
  });

  it('dispatches a new margin on change', () => {
    const onDiskChange = vi.fn();
    const { getByTestId } = render(
      <DiskControls disk={base} catalogAxisRatio={0.5} onDiskChange={onDiskChange} />,
    );
    fireEvent.change(getByTestId('margin-slider'), { target: { value: '0.5' } });
    expect(onDiskChange).toHaveBeenCalledWith(expect.objectContaining({ margin: 0.5 }));
  });
});
