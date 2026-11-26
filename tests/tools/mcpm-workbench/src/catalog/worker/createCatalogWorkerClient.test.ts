import { describe, expect, it, vi } from 'vitest';
import type { CatalogImportSettings } from '../../../../../../tools/mcpm-workbench/@types/catalog/import/CatalogImportSettings';
import type { CatalogPreview } from '../../../../../../tools/mcpm-workbench/@types/catalog/import/CatalogPreview';
import { createCatalogWorkerClient } from '../../../../../../tools/mcpm-workbench/src/catalog/worker/createCatalogWorkerClient';
import { createCatalogWorkerHandler } from '../../../../../../tools/mcpm-workbench/src/catalog/worker/createCatalogWorkerHandler';
import { inProcessCatalogWorkerTransport } from '../../../../../fixtures/inProcessCatalogWorkerTransport';

const XYZ: CatalogImportSettings = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
};
const SCALED: CatalogImportSettings = { ...XYZ, weight: { kind: 'linear', scale: 0.5 } };
// x from -4 to 1, weights 0.02 and 0.04.
const TWO_ROWS = '1,2,3,0.02\n-4,5,-6,0.04\n';

const csv = (text: string, name = 'a.csv') => ({
  kind: 'csv' as const,
  file: new File([text], name),
});
const client = () => createCatalogWorkerClient(inProcessCatalogWorkerTransport);
const weights = (preview: CatalogPreview | null) =>
  preview?.outcome.kind === 'ready' ? Array.from(preview.outcome.catalog.points.weight) : null;

describe('createCatalogWorkerClient', () => {
  it('reads a file once and derives it under each new setting', async () => {
    const worker = client();
    const files = csv(TWO_ROWS);
    const stream = vi.spyOn(files.file, 'stream');

    expect(await worker.read(files)).toEqual({ kind: 'held' });
    expect(weights(await worker.derive(XYZ, 100))).toEqual([Math.fround(0.02), Math.fround(0.04)]);
    expect(weights(await worker.derive(SCALED, 100))).toEqual([
      Math.fround(0.01),
      Math.fround(0.02),
    ]);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('shows the file with its bounds, weight spread and the box Auto fit would fit', async () => {
    const worker = client();
    void worker.read(csv(TWO_ROWS));
    const preview = await worker.derive(XYZ, 100);

    expect(preview?.bounds).toEqual({ min: [-4, 2, -6], max: [1, 5, 3] });
    expect(preview?.weight?.mean).toBeCloseTo(0.03, 6);
    expect(preview?.weight?.stdDev).toBeCloseTo(0.01, 6);
    expect(preview?.fitBounds).toEqual(preview?.bounds);
  });

  it('a newer derive supersedes one still waiting', async () => {
    const worker = client();
    void worker.read(csv(TWO_ROWS));
    const first = worker.derive(XYZ, 100);
    const second = worker.derive(SCALED, 100);

    expect(await first).toBeNull();
    expect(weights(await second)).toEqual([Math.fround(0.01), Math.fround(0.02)]);
  });

  it('a newer file supersedes one still being read', async () => {
    const worker = client();
    const first = worker.read(csv(TWO_ROWS));
    const second = worker.read(csv('0,0,0,0.5\n'));

    expect(await first).toBeNull();
    expect(await second).toEqual({ kind: 'held' });
    expect(weights(await worker.derive(XYZ, 100))).toEqual([0.5]);
  });

  it('a file the browser cannot read is refused, with no derive left waiting', async () => {
    const worker = client();
    const files = csv(TWO_ROWS);
    vi.spyOn(files.file, 'stream').mockImplementation(() => {
      throw new Error('The file could not be read');
    });
    const read = worker.read(files);
    const preview = worker.derive(XYZ, 100);

    expect(await read).toEqual({ kind: 'problem', message: 'The file could not be read' });
    expect(await preview).toBeNull();
  });

  it('a text problem comes back with the example shown', async () => {
    const worker = client();
    void worker.read(csv('1,2,3\n'));
    const preview = await worker.derive(XYZ, 100);

    expect(preview?.outcome).toEqual({
      kind: 'problem',
      message: 'Line 1: expected 4 numbers, found 3',
      showExample: true,
    });
  });

  it('reads a packed pair through the same path', async () => {
    const worker = client();
    const bin = new File([new Float32Array([1, 2, 3, 0.5]).buffer], 'run.bin');
    const metadata = new File(['Number of points = 1\nMean weight = 0.5\n'], 'run_metadata.txt');
    void worker.read({ kind: 'packed', bin, metadata });
    const preview = await worker.derive(SCALED, 100);

    expect(preview?.outcome.kind).toBe('ready');
    expect(weights(preview)).toEqual([0.5]); // a packed pair ignores the settings
  });
});

describe('createCatalogWorkerHandler', () => {
  it('hands the stored arrays over as transferables, keeping no copy', async () => {
    const post = vi.fn();
    const handle = createCatalogWorkerHandler(post);
    handle({ kind: 'read', id: 1, files: csv(TWO_ROWS) });
    handle({ kind: 'derive', id: 2, settings: XYZ, autoFitPercent: 100 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const [response, transfer] = post.mock.calls[1]!;
    const { points } = response.preview.outcome.catalog;
    expect(transfer).toEqual([points.positions.buffer, points.weight.buffer]);
  });
});
