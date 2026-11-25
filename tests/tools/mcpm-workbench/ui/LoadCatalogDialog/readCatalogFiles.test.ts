import { describe, expect, it } from 'vitest';
import { readCatalogFiles } from '../../../../../tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/readCatalogFiles';

const file = (name: string, size = 10): File => {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  f.text = () => Promise.reject(new Error('read'));
  return f;
};

describe('readCatalogFiles', () => {
  it('refuses a file over 400 MB without reading it', () => {
    expect(readCatalogFiles([file('desi.csv', 401e6)])).toEqual({
      kind: 'problem',
      message: 'File is larger than 400 MB. Use a smaller sample, or the native build.',
    });
  });

  it('pairs a .bin with its metadata in either order', () => {
    const bin = file('run.bin');
    const metadata = file('run_metadata.txt');
    expect(readCatalogFiles([metadata, bin])).toEqual({ kind: 'packed', bin, metadata });
  });

  it('reads a lone .csv, .tsv, .txt or .dat as a text table', () => {
    for (const name of ['a.csv', 'b.tsv', 'c.txt', 'D.DAT']) {
      const table = file(name);
      expect(readCatalogFiles([table])).toEqual({ kind: 'csv', file: table });
    }
  });

  // A .txt beside a .bin is its metadata, never a table of its own.
  it('refuses a .bin without its metadata', () => {
    const wrongType = {
      kind: 'problem',
      message: 'Choose a text table, or a .bin + _metadata.txt',
    };
    expect(readCatalogFiles([file('run.bin')])).toEqual(wrongType);
    expect(readCatalogFiles([file('run.bin'), file('run.dat')])).toEqual(wrongType);
    expect(readCatalogFiles([file('a.txt'), file('b.txt')])).toEqual(wrongType);
    expect(readCatalogFiles([file('run.json')])).toEqual(wrongType);
  });
});
