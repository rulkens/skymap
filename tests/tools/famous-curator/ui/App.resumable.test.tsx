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
          {
            id: 'm31',
            names: ['M31'],
            ra: 0,
            dec: 0,
            distanceMpc: 0,
            diameterKpc: 0,
            type: '',
            description: '',
            curated: true,
          },
        ],
      }),
      getRecipe: vi.fn().mockResolvedValue({
        recipe: {
          version: 1,
          id: 'm31',
          crop: { x: 50, y: 60, width: 700, height: 700, rotationDeg: 0 },
          starnet: { stride: 512, upsample: true },
          alpha: { blackPoint: 12, whitePoint: 240, gamma: 0.55 },
          metadata: { sourceUrl: 'https://a', license: 'CC-BY', author: 'Alice' },
          processedAt: '2026-05-18T00:00:00Z',
        },
      }),
      postFetchUrl: vi.fn().mockResolvedValue({
        tmpId: 't1',
        width: 1000,
        height: 800,
        previewUrl: '/p.webp',
        mediaType: 'image/jpeg',
      }),
      postFetchBytes: vi.fn(),
      resolveMedia: vi.fn(),
      postProcess: vi.fn(),
      postAlphaOnly: vi.fn(),
      postExport: vi.fn(),
      postBuildFamous: vi.fn(),
    } as Api & { getRecipe: ReturnType<typeof vi.fn> };

    render(
      <ApiProvider value={api}>
        <App />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByText('M31')).toBeInTheDocument());

    fireEvent.click(screen.getByText('M31'));

    // Recipe fetch happens; then source URL is re-fetched.
    // Double-cast via unknown: `api` is typed as Api, but we need to narrow
    // to the spy type to call `.toHaveBeenCalledWith`.
    await waitFor(() =>
      expect(
        (api as unknown as { getRecipe: ReturnType<typeof vi.fn> }).getRecipe,
      ).toHaveBeenCalledWith('m31'),
    );
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://a'));

    // Sliders are restored.
    await waitFor(() => {
      const gammaInput = screen.getByLabelText(/gamma/i) as HTMLInputElement;
      expect(gammaInput.value).toBe('0.55');
    });
  });

  it('resume with disk in recipe re-hydrates disk, then Commit includes disk in postExport', async () => {
    // Recipe carries a disk block — after re-selecting this curated galaxy
    // the disk should be written back into state (setDisk), then when the
    // user hits Commit the disk must reach postExport so it gets persisted
    // on the next recipe.json write.
    const recipeDisk = {
      centerPx: [500, 400] as [number, number],
      radiusPx: 120,
      paDeg: 45,
      axisRatio: 0.6,
      deproject: true,
    };
    const api: Api = {
      getGalaxies: vi.fn().mockResolvedValue({
        galaxies: [
          {
            id: 'm81',
            names: ['M81'],
            ra: 0,
            dec: 0,
            distanceMpc: 0,
            diameterKpc: 0,
            type: '',
            description: '',
            curated: true,
          },
        ],
      }),
      getRecipe: vi.fn().mockResolvedValue({
        recipe: {
          version: 1,
          id: 'm81',
          crop: { x: 0, y: 0, width: 800, height: 800, rotationDeg: 0 },
          starnet: { stride: 256, upsample: false },
          alpha: { blackPoint: 8, whitePoint: 255, gamma: 0.7 },
          metadata: { sourceUrl: 'https://b', license: 'CC-BY-SA', author: 'Bob' },
          processedAt: '2026-05-20T00:00:00Z',
          disk: recipeDisk,
        },
      }),
      postFetchUrl: vi.fn().mockResolvedValue({
        tmpId: 't2',
        width: 1000,
        height: 1000,
        previewUrl: '/p2.webp',
        mediaType: 'image/jpeg',
      }),
      postFetchBytes: vi.fn(),
      resolveMedia: vi.fn(),
      postProcess: vi
        .fn()
        .mockResolvedValue({ starlessPreviewUrl: '/s.webp', alphaPreviewUrl: '/a.webp' }),
      postAlphaOnly: vi.fn(),
      postExport: vi.fn().mockResolvedValue({
        paths: { source: '', starless: '', full: '', atlas: '', recipe: '' },
      }),
      postBuildFamous: vi.fn().mockResolvedValue({
        ok: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 0,
      }),
    };

    render(
      <ApiProvider value={api}>
        <App />
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.getByText('M81')).toBeInTheDocument());

    fireEvent.click(screen.getByText('M81'));

    // Source re-fetch completes — once setSource fires the DiskOverlay
    // receives props.disk (from setDisk dispatch) and props.source, so the
    // center handle should appear in the SVG.
    await waitFor(() => expect(api.postFetchUrl).toHaveBeenCalledWith('https://b'));
    await waitFor(() => expect(screen.getByTestId('disk-handle-center')).toBeInTheDocument());

    // Commit: state.dirty.disk is true (setDisk sets it), so process fires
    // first, then export.  postExport must carry the disk block so the new
    // recipe.json reflects the restored geometry.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^commit$/i }));
    await waitFor(() => expect(api.postExport).toHaveBeenCalled());

    const exportCall = (api.postExport as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(exportCall).toMatchObject({ disk: recipeDisk });
  });
});
