// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { Splash } from '../../../src/components/Splash/Splash';

function makeProps(overrides: Partial<React.ComponentProps<typeof Splash>> = {}) {
  return {
    blocked: false,
    canContinueAnyway: false,
    error: null,
    onExplore: vi.fn(),
    onTour: vi.fn(),
    onContinueAnyway: vi.fn(),
    onReload: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof Splash>;
}

describe('Splash', () => {
  it('renders a dialog with the title "Explore millions of galaxies in 3D"', () => {
    render(createElement(Splash, makeProps()));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Explore millions of galaxies in 3D')).toBeInTheDocument();
  });

  it('mentions SDSS, GLADE, and 2MRS with new-tab links', () => {
    render(createElement(Splash, makeProps()));
    const sdss = screen.getByRole('link', { name: /sdss/i });
    const glade = screen.getByRole('link', { name: /glade/i });
    const mrs2 = screen.getByRole('link', { name: /2mrs/i });
    for (const link of [sdss, glade, mrs2]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('renders the author + github attribution in the footer', () => {
    render(createElement(Splash, makeProps()));
    expect(screen.getByText(/alexander rulkens/i)).toBeInTheDocument();
    const ghLink = screen.getByRole('link', { name: /github\.com\/rulkens\/skymap/i });
    expect(ghLink).toHaveAttribute('href', 'https://github.com/rulkens/skymap');
  });

  it('renders Explore (primary) and Tour (secondary) CTAs', () => {
    render(createElement(Splash, makeProps()));
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tour$/i })).toBeInTheDocument();
  });

  it('disables CTAs when blocked=true', () => {
    render(createElement(Splash, makeProps({ blocked: true })));
    expect(screen.getByRole('button', { name: /^explore$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^tour$/i })).toBeDisabled();
  });

  it('fires onExplore when Explore is clicked', async () => {
    const onExplore = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ onExplore })));
    await user.click(screen.getByRole('button', { name: /^explore$/i }));
    expect(onExplore).toHaveBeenCalledOnce();
  });

  it('fires onTour when Tour is clicked', async () => {
    const onTour = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ onTour })));
    await user.click(screen.getByRole('button', { name: /^tour$/i }));
    expect(onTour).toHaveBeenCalledOnce();
  });

  it('shows the Continue anyway link only when canContinueAnyway=true and blocked=true', () => {
    const { rerender } = render(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: false })));
    expect(screen.queryByRole('button', { name: /continue anyway/i })).not.toBeInTheDocument();
    rerender(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: true })));
    expect(screen.getByRole('button', { name: /continue anyway/i })).toBeInTheDocument();
  });

  it('fires onContinueAnyway when the link is clicked', async () => {
    const onContinueAnyway = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ blocked: true, canContinueAnyway: true, onContinueAnyway })));
    await user.click(screen.getByRole('button', { name: /continue anyway/i }));
    expect(onContinueAnyway).toHaveBeenCalledOnce();
  });

  it('disables Tour with a tooltip when error.kind=famous-meta-failed', () => {
    render(createElement(Splash, makeProps({ error: { kind: 'famous-meta-failed' } })));
    const tour = screen.getByRole('button', { name: /^tour$/i });
    expect(tour).toBeDisabled();
    expect(tour).toHaveAttribute('title', expect.stringMatching(/tour|unavailable/i));
    // Explore stays interactive in this case.
    expect(screen.getByRole('button', { name: /^explore$/i })).not.toBeDisabled();
  });

  it('shows a reload button when error.kind=catalog-fetch-failed', async () => {
    const onReload = vi.fn();
    const user = userEvent.setup();
    render(createElement(Splash, makeProps({ error: { kind: 'catalog-fetch-failed', message: 'fail' }, onReload })));
    const reload = screen.getByRole('button', { name: /reload/i });
    await user.click(reload);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('shows the WebGPU-init error message when error.kind=webgpu-init-failed', () => {
    render(createElement(Splash, makeProps({ error: { kind: 'webgpu-init-failed', message: 'adapter null' } })));
    expect(screen.getByText(/webgpu failed/i)).toBeInTheDocument();
  });
});
