import { describe, expect, it } from 'vitest';
import { classifyCatalogFiles } from '../../../../../../../tools/mcpm-workbench/src/ui/catalog/LoadCatalogDialog/utils/classifyCatalogFiles';

const file = (name: string, size = 10): File => {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  f.text = () => Promise.reject(new Error('read'));
  return f;
};

describe('classifyCatalogFiles', () => {
  it('refuses a file over 400 MB without reading it', () => {
    expect(classifyCatalogFiles([file('desi.csv', 401e6)])).toEqual({
      kind: 'problem',
      message: 'File is larger than 400 MB. Use a smaller sample, or the native build.',
    });
  });

  it('pairs a .bin with its metadata in either order', () => {
    const bin = file('run.bin');
    const metadata = file('run_metadata.txt');
    expect(classifyCatalogFiles([metadata, bin])).toEqual({ kind: 'packed', bin, metadata });
  });

  it('reads a lone .csv, .tsv, .txt or .dat as a catalog', () => {
    for (const name of ['a.csv', 'b.tsv', 'c.txt', 'D.DAT']) {
      const table = file(name);
      expect(classifyCatalogFiles([table])).toEqual({ kind: 'csv', file: table });
    }
  });

  // A .txt beside a .bin is its metadata, never a table of its own.
  it('refuses a .bin without its metadata', () => {
    const wrongType = {
      kind: 'problem',
      message: 'Choose a .csv file, or a .bin with its _metadata.txt',
    };
    expect(classifyCatalogFiles([file('run.bin')])).toEqual(wrongType);
    expect(classifyCatalogFiles([file('run.bin'), file('run.dat')])).toEqual(wrongType);
    expect(classifyCatalogFiles([file('a.txt'), file('b.txt')])).toEqual(wrongType);
    expect(classifyCatalogFiles([file('run.json')])).toEqual(wrongType);
  });
});
