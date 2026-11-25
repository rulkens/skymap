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
    expect(readCatalogFiles([file('desi.csv', 401 * 1024 * 1024)])).toEqual({
      kind: 'problem',
      message: 'File is larger than 400 MB. Use a smaller sample, or the native build.',
    });
  });

  it('pairs a .bin with its metadata in either order', () => {
    const bin = file('run.bin');
    const metadata = file('run_metadata.txt');
    expect(readCatalogFiles([metadata, bin])).toEqual({ kind: 'packed', bin, metadata });
  });

  it('refuses a .bin without its metadata', () => {
    expect(readCatalogFiles([file('run.bin')]).kind).toBe('problem');
  });
});
