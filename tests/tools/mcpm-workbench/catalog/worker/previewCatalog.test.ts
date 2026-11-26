import { describe, expect, it } from 'vitest';
import { previewCatalog } from '../../../../../tools/mcpm-workbench/src/catalog/worker/previewCatalog';

const CSV_SETTINGS = {
  format: { kind: 'cartesianMpc' },
  weight: { kind: 'linear', scale: 1 },
} as const;

describe('previewCatalog', () => {
  it('says an empty packed pair holds no points, as the CSV path says it has no rows', () => {
    const { outcome } = previewCatalog(
      {
        kind: 'packed',
        fileName: 'empty.bin + empty_metadata.txt',
        bin: new ArrayBuffer(0),
        metadataText: 'Number of points = 0\nMean weight = 0\n',
      },
      CSV_SETTINGS,
      97,
    );
    expect(outcome).toEqual({ kind: 'problem', message: 'No points found', showExample: false });
  });
});
