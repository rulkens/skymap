import { describe, expect, it } from 'vitest';

import { shotFileIndex } from '../../../tools/site/utils/shotFileIndex';
import { shotFileName } from '../../../tools/site/utils/shotFileName';

describe('shotFileIndex', () => {
  // The runner names the files and the pages find them through the index: a change to one alone loses every picture.
  it('finds a file the runner named under its name, width and format', () => {
    const file = shotFileName('saturn-shadow', 640, 'avif', new Uint8Array([1, 2, 3]));
    expect(file).toMatch(/^saturn-shadow-640\.[0-9a-f]{8}\.avif$/);
    expect(shotFileIndex(['.DS_Store', 'saturn-640.avif', file])).toEqual({
      'saturn-shadow-640.avif': file,
    });
  });
});
