// @vitest-environment jsdom
/**
 * DiskOverlay — structure smoke tests.
 *
 * Pointer-drag simulation is brittle in jsdom (no real layout, no
 * getBoundingClientRect returning useful values).  These tests cover
 * the deterministic surface: which SVG elements are rendered when a
 * disk is present vs absent.  The geometry helpers are unit-tested in
 * diskOverlay.test.ts; this just confirms the component wires them up.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiskOverlay } from '../../../../../tools/famous-curator/ui/components/DiskOverlay';
import type { RecipeDisk } from '../../../../../tools/famous-curator/plugin/recipe';

const source = { width: 500, height: 400, previewUrl: '/p.webp' };

const disk: RecipeDisk = {
  centerPx: [250, 200],
  radiusPx: 80,
  paDeg: 30,
  axisRatio: 0.6,
  deproject: false,
};

describe('DiskOverlay', () => {
  it('renders center, edge, and minor handles when a disk is present', () => {
    render(<DiskOverlay source={source} disk={disk} interactive={false} onDiskChange={vi.fn()} />);
    expect(screen.getByTestId('disk-handle-center')).toBeInTheDocument();
    expect(screen.getByTestId('disk-handle-edge')).toBeInTheDocument();
    expect(screen.getByTestId('disk-handle-minor')).toBeInTheDocument();
  });

  it('renders no handles when disk is undefined', () => {
    render(
      <DiskOverlay source={source} disk={undefined} interactive={false} onDiskChange={vi.fn()} />,
    );
    expect(screen.queryByTestId('disk-handle-center')).not.toBeInTheDocument();
    expect(screen.queryByTestId('disk-handle-edge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('disk-handle-minor')).not.toBeInTheDocument();
  });

  it('renders the SVG with the correct viewBox', () => {
    const { container } = render(
      <DiskOverlay source={source} disk={disk} interactive={true} onDiskChange={vi.fn()} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 500 400');
  });

  it('has pointer-events:none on svg when not interactive', () => {
    const { container } = render(
      <DiskOverlay source={source} disk={disk} interactive={false} onDiskChange={vi.fn()} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.pointerEvents).toBe('none');
  });

  it('has pointer-events:auto on svg when interactive', () => {
    const { container } = render(
      <DiskOverlay source={source} disk={disk} interactive={true} onDiskChange={vi.fn()} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.pointerEvents).toBe('auto');
  });

  const previewDisk: RecipeDisk = {
    centerPx: [300, 300],
    radiusPx: 80,
    paDeg: 30,
    axisRatio: 0.5,
    deproject: true,
  };
  const src = { width: 1000, height: 1000, previewUrl: 'data:,' };

  it('renders crop-preview-rect when interactive + deproject active', () => {
    const { queryByTestId } = render(
      <DiskOverlay
        source={src}
        disk={previewDisk}
        catalogAxisRatio={0.5}
        interactive={true}
        onDiskChange={() => {}}
        deprojectAspect={0.5}
        margin={0.25}
      />,
    );
    expect(queryByTestId('crop-preview-rect')).not.toBeNull();
  });

  it('omits crop-preview-rect when deprojectAspect is undefined', () => {
    const { queryByTestId } = render(
      <DiskOverlay
        source={src}
        disk={previewDisk}
        catalogAxisRatio={0.5}
        interactive={true}
        onDiskChange={() => {}}
        deprojectAspect={undefined}
        margin={undefined}
      />,
    );
    expect(queryByTestId('crop-preview-rect')).toBeNull();
  });
});
