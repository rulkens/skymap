// @vitest-environment jsdom
/**
 * When the user clicks an already-curated galaxy, the App fetches the
 * existing recipe.json + re-fetches the source URL so the sliders +
 * crop box reconstruct the prior state.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../../../tools/famous-curator/ui/App';
import { ApiProvider } from '../../../../tools/famous-curator/ui/apiContext';
import type { Api } from '../../../../tools/famous-curator/ui/api';

describe('App resumable', () => {
  it('clicking a curated galaxy fetches its recipe + restores sliders + crop', async () => {
    const api: Api = {
      getGalaxies: vi.fn().mockResolvedValue({
        galaxies: [
          { id: 'm31', names: ['M31'], ra: 0, dec: 0, distanceMpc: 0, diameterKpc: 0, type: '', description: '', curated: true },
        ],
      }),
      getRecipe: vi.fn().mockResolvedValue({
        recipe: {
          version: 1, id: 'm31',
          crop: { x: 50, y: 60, width: 700, height: 700, rotationDeg: 0 },
          starnet: { stride: 512, upsample: true },
          alpha: { blackPoint: 12, whitePoint: 240, gamma: 0.55 },
          metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' },
          processedAt: '2026-05-18T00:00:00Z',
        },
      }),
      postFetchUrl: vi.fn().mockResolvedValue({
        tmpId: 't1', width: 1000, height: 800, previewUrl: '/p.webp', mediaType: 'image/jpeg',
      }),
      postFetchBytes: vi.fn(),
      resolveMedia: vi.fn(),
      postProcess: vi.fn(),
      postAlphaOnly: vi.fn(),
      postExport: vi.fn(),
      postBuildFamous: vi.fn(),
    } as Api & { getRecipe: ReturnType<typeof vi.fn> };

    render(<ApiProvider value={api}><App /></ApiProvider>);
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());

    fireEvent.click(screen.getByText('M31'));

    // Recipe fetch happens; then source URL is re-fetched.
    // Double-cast via unknown: `api` is typed as Api, but we need to narrow
    // to the spy type to call `.toHaveBeenCalledWith`.
    await waitFor(() => expect((api as unknown as { getRecipe: ReturnType<typeof vi.fn> }).getRecipe).toHaveBeenCalledWith('m31'));
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://a'));

    // Sliders are restored.
    await waitFor(() => {
      const gammaInput = screen.getByLabelText(/gamma/i) as HTMLInputElement;
      expect(gammaInput.value).toBe('0.55');
    });
  });
});
