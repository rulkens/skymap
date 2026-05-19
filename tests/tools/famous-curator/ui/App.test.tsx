// @vitest-environment jsdom
/**
 * App — integration test for the curator shell.
 *
 * Injects a fake API via ApiProvider, drives the full
 * select-galaxy → paste-URL → fetch → process → alpha-only → export
 * flow, and asserts the corresponding api calls.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../../tools/famous-curator/ui/App';
import { ApiProvider } from '../../../../tools/famous-curator/ui/apiContext';
import type { Api } from '../../../../tools/famous-curator/ui/api';

function makeFakeApi(): Api {
  return {
    getGalaxies: vi.fn().mockResolvedValue({
      galaxies: [
        { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
        { id: 'm33', names: ['M33'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: false },
      ],
    }),
    // Not called in this test — all galaxies are curated: false.
    getRecipe: vi.fn(),
    postFetchUrl: vi.fn().mockResolvedValue({
      tmpId: 't1', width: 1000, height: 800, previewUrl: '/preview.webp', mediaType: 'image/jpeg',
    }),
    postFetchBytes: vi.fn(),
    postProcess: vi.fn().mockResolvedValue({ starlessPreviewUrl: '/s.webp', alphaPreviewUrl: '/a.webp' }),
    postAlphaOnly: vi.fn().mockResolvedValue({ alphaPreviewUrl: '/a2.webp' }),
    postExport: vi.fn().mockResolvedValue({
      paths: { source: '', starless: '', full: '', atlas: '', recipe: '' },
    }),
    postBuildFamous: vi.fn().mockResolvedValue({
      ok: true, exitCode: 0, stdout: '', stderr: '', durationMs: 0,
    }),
  };
}

describe('App', () => {
  it('loads the galaxy list on mount', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());
  });

  it('full happy-path flow', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());

    // 1. Click M31 in the list.
    fireEvent.click(screen.getByText('M31'));

    // 2. Paste URL + click Fetch.
    fireEvent.change(screen.getByLabelText(/source url to fetch/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://e.com/img.jpg'));

    // 3. Wait for crop to initialise.  resetCrop returns min(w, h) —
    // for 1000×800 that's an 800² square centred at x=(1000-800)/2=100, y=0.
    await waitFor(() => expect(screen.getByText(/800 × 800 of 1000 × 800/)).toBeInTheDocument());

    // 4. Fill metadata.
    fireEvent.change(screen.getByLabelText(/^source url$/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY' } });
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'Alice' } });

    // 5. Click Commit — runs process → export → build-famous in sequence.
    await waitFor(() => expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    await waitFor(() => expect(api.postProcess).toHaveBeenCalled());
    await waitFor(() => expect(api.postExport).toHaveBeenCalled());
    await waitFor(() => expect(api.postBuildFamous).toHaveBeenCalled());

    const exportCall = (api.postExport as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(exportCall.id).toBe('m31');
    expect(exportCall.metadata.author).toBe('Alice');
  });

  it('alpha slider change triggers alpha-only re-render after first Commit', async () => {
    const api = makeFakeApi();
    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());
    fireEvent.click(screen.getByText('M31'));
    fireEvent.change(screen.getByLabelText(/source url to fetch/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalled());

    // Fill metadata so Commit is enabled, then click it.
    fireEvent.change(screen.getByLabelText(/^source url$/i), { target: { value: 'https://e.com/img.jpg' } });
    fireEvent.change(screen.getByLabelText(/license/i), { target: { value: 'CC-BY' } });
    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'Alice' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    await waitFor(() => expect(api.postProcess).toHaveBeenCalled());

    // Move gamma slider — should fire postAlphaOnly, NOT postProcess again.
    fireEvent.change(screen.getByLabelText(/gamma/i), { target: { value: '1.2' } });
    await waitFor(() => expect(api.postAlphaOnly).toHaveBeenCalled());
    expect((api.postProcess as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
