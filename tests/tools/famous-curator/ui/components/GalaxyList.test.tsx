// @vitest-environment jsdom
/**
 * GalaxyList — left-panel scrollable list of seed entries.
 *
 * Props: galaxies, activeId, onSelect.  Done galaxies show a checkmark.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GalaxyList } from '../../../../../tools/famous-curator/ui/components/GalaxyList';

const ENTRY = (
  id: string,
  curated = false,
  hasDisk = false,
  diskDeproject: boolean | undefined = undefined,
) => ({
  id,
  names: [id.toUpperCase()],
  ra: 0,
  dec: 0,
  distanceMpc: 0,
  diameterKpc: 0,
  type: '',
  description: '',
  curated,
  hasDisk,
  ...(diskDeproject !== undefined ? { diskDeproject } : {}),
});

describe('GalaxyList', () => {
  it('renders every entry with its primary name', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31'), ENTRY('m33'), ENTRY('m51')]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('M31')).toBeInTheDocument();
    expect(screen.getByText('M33')).toBeInTheDocument();
    expect(screen.getByText('M51')).toBeInTheDocument();
  });

  it('marks curated entries with the data-curated attribute', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31', true), ENTRY('m33', false)]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    const m31 = screen.getByText('M31').closest('[data-galaxy-id]');
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]');
    expect(m31?.getAttribute('data-curated')).toBe('true');
    expect(m33?.getAttribute('data-curated')).toBe('false');
  });

  it('marks the active entry with aria-current', () => {
    render(
      <GalaxyList galaxies={[ENTRY('m31'), ENTRY('m33')]} activeId="m33" onSelect={vi.fn()} />,
    );
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]');
    expect(m33?.getAttribute('aria-current')).toBe('true');
  });

  it('calls onSelect(id) on click', () => {
    const onSelect = vi.fn();
    render(<GalaxyList galaxies={[ENTRY('m31')]} activeId={undefined} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('M31'));
    expect(onSelect).toHaveBeenCalledWith('m31');
  });

  it('shows a disk indicator only for entries with a committed disk', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31', true, true), ENTRY('m33', true, false)]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    const m31 = screen.getByText('M31').closest('[data-galaxy-id]')!;
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]')!;
    expect(m31.querySelector('[data-testid="disk-indicator"]')).not.toBeNull();
    expect(m33.querySelector('[data-testid="disk-indicator"]')).toBeNull();
  });

  it('varies the disk indicator label by deproject state', () => {
    render(
      <GalaxyList
        galaxies={[ENTRY('m31', true, true, true), ENTRY('m33', true, true, false)]}
        activeId={undefined}
        onSelect={vi.fn()}
      />,
    );
    const m31 = screen.getByText('M31').closest('[data-galaxy-id]')!;
    const m33 = screen.getByText('M33').closest('[data-galaxy-id]')!;
    expect(m31.querySelector('[data-testid="disk-indicator"]')?.getAttribute('aria-label')).toBe(
      'Has calibrated disk (deprojected)',
    );
    expect(m33.querySelector('[data-testid="disk-indicator"]')?.getAttribute('aria-label')).toBe(
      'Has calibrated disk (flat)',
    );
  });
});
