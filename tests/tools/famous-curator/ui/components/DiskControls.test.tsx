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

  it('disables the toggle when too edge-on and shows the note', () => {
    const edgeOnDisk: RecipeDisk = { ...baseDisk, axisRatio: 0.2 };
    render(<DiskControls disk={edgeOnDisk} catalogAxisRatio={undefined} onDiskChange={vi.fn()} />);
    const checkbox = screen.getByLabelText(/deproject to face-on/i);
    expect(checkbox).toBeDisabled();
    // The note includes "as-shot only" and the threshold explanation.
    expect(screen.getByText(/as-shot only/i)).toBeInTheDocument();
  });
});
