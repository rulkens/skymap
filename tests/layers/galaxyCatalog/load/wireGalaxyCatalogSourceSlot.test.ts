/**
 * wireGalaxyCatalogSourceSlot — the per-source galaxy-catalog slot, built by the
 * Layer's `create`. Every source shares one shape: name = `${entry.id}-points`,
 * upload-on-commit, per-item fade re-sync after the upload, and the two
 * subscriber writes (core's catalog-landed pulse, the provenance fact).
 *
 * The AssetSlot retry policy and race checking are `AssetSlot.test.ts`'s; this
 * suite is about the plumbing between the registry entry, the renderer and the
 * runtime's own catalog map.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SourceType } from '../../../../src/@types/data/SourceType';

// The mint helper picks this fetcher for every non-synthetic entry (every
// source this suite exercises); stub it so each test controls the resolved
// catalog instead of hitting the network.
vi.mock('../../../../src/layers/galaxyCatalog/load/galaxyCatalogFetcher', () => ({
  galaxyCatalogFetcher: vi.fn(),
}));

import { wireGalaxyCatalogSourceSlot } from '../../../../src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot';
import { galaxyCatalogFetcher } from '../../../../src/layers/galaxyCatalog/load/galaxyCatalogFetcher';
import { Source, SOURCE_REGISTRY } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { installSlotReadyWake } from '../../../../src/services/engine/wiring/installSlotReadyWake';
import type { LayerCoreDeps } from '../../../../src/@types/engine/layer/LayerCoreDeps';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { ProvenanceCounts } from '../../../../src/@types/engine/ProvenanceCounts';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { GalaxyCatalogFacts } from '../../../../src/layers/galaxyCatalog/types/GalaxyCatalogFacts';

/** Only `count` is read by the subscriber and the upload log line. */
function fakeCloud(count: number): GalaxyCatalog {
  return { count } as unknown as GalaxyCatalog;
}

function harness(opts: { enabled?: boolean } = {}) {
  const upload = vi.fn().mockResolvedValue(undefined);
  const pointRenderer = {
    upload,
    loadedSources: () => [],
    totalCount: () => 0,
  } as never;
  const catalogs = new Map<SourceType, GalaxyCatalog>();
  const provenanceCounts = new Map<SourceType, ProvenanceCounts>();
  const fades = {
    targetOf: vi.fn(() => 0),
    fadeTo: vi.fn(() => Promise.resolve()),
  };
  const deps = {
    store: {
      getState: () => ({
        settings: {
          galaxyCatalogs: {
            items: { sdss: { enabled: opts.enabled ?? true }, glade: { enabled: true } },
          },
        },
      }),
    },
    fades,
    reportSourceCount: vi.fn(),
    publish: vi.fn(),
  } as unknown as LayerCoreDeps<GalaxyCatalogFacts>;
  return { upload, pointRenderer, catalogs, provenanceCounts, fades, deps };
}

describe('wireGalaxyCatalogSourceSlot', () => {
  beforeEach(() => vi.mocked(galaxyCatalogFetcher).mockReset());

  it('mints an idle slot named after the registry entry', () => {
    const h = harness();
    const slot = wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[Source.SDSS], h.deps, h);

    expect(slot.name).toBe('sdss-points');
    expect(slot.state().kind).toBe('idle');
  });

  it('reports the source count through core’s pulse and publishes the provenance tally', async () => {
    const h = harness();
    vi.mocked(galaxyCatalogFetcher).mockResolvedValue(fakeCloud(42));

    const slot = wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[Source.SDSS], h.deps, h);
    void slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(h.deps.reportSourceCount).toHaveBeenCalledWith(Source.SDSS, 42);
    expect(h.deps.publish).toHaveBeenCalledTimes(1);
    const patch = vi.mocked(h.deps.publish).mock.calls[0]![0] as {
      provenanceCounts: Record<number, unknown>;
    };
    expect(patch.provenanceCounts[Source.SDSS]).toBeDefined();
    // A COPY of the runtime's map: a shared reference would be frozen by immer.
    expect(patch.provenanceCounts).not.toBe(h.provenanceCounts);
  });

  it('commit uploads the cloud to the renderer and writes it into the runtime catalogs', async () => {
    const h = harness();
    const cloud = fakeCloud(7);
    vi.mocked(galaxyCatalogFetcher).mockResolvedValue(cloud);

    const slot = wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[Source.Glade], h.deps, h);
    void slot.load({ source: Source.Glade, tier: 'small' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.upload).toHaveBeenCalledWith(SOURCE_REGISTRY[Source.Glade].id, cloud);
    expect(h.catalogs.get(Source.Glade)).toBe(cloud);
  });

  it('drives this catalog’s fade-in only, after the upload', async () => {
    const h = harness();
    vi.mocked(galaxyCatalogFetcher).mockResolvedValue(fakeCloud(5));

    const slot = wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[Source.SDSS], h.deps, h);
    void slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    // The single-ITEM entry, applying the survey row's intent to ONLY this
    // catalog rather than every survey id — a sweep would re-drive the fades a
    // concurrent tier swap has in flight for the others.
    expect(h.fades.fadeTo).toHaveBeenCalledTimes(1);
    expect(h.fades.fadeTo).toHaveBeenCalledWith(
      { kind: 'galaxyCatalog', id: galaxyCatalogIdOf(Source.SDSS) },
      1,
      expect.any(Number),
    );
    expect(h.upload.mock.invocationCallOrder[0]!).toBeLessThan(
      h.fades.fadeTo.mock.invocationCallOrder[0]!,
    );
  });

  it('a re-commit whose fade is already held still requests a render', async () => {
    // The render wake a re-commit needs was never the fade's to give:
    // `installSlotReadyWake` fires on every `ready` transition regardless of
    // whether the row's fade has anything left to animate.
    const h = harness();
    h.fades.targetOf.mockReturnValue(1);
    const requestRender = vi.fn();
    vi.mocked(galaxyCatalogFetcher).mockResolvedValue(fakeCloud(5));

    const slot = wireGalaxyCatalogSourceSlot(SOURCE_REGISTRY[Source.SDSS], h.deps, h);
    installSlotReadyWake(
      requestRender,
      new Map([['sdss-points', slot as unknown as AssetSlot<unknown, unknown>]]),
    );

    void slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    requestRender.mockClear();

    void slot.load({ source: Source.SDSS, tier: 'medium' });
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(requestRender).toHaveBeenCalled());
    // Nothing to animate, so the commit skipped the fade write entirely.
    expect(h.fades.fadeTo).not.toHaveBeenCalled();
  });
});
