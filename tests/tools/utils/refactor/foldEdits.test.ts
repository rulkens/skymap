import { describe, it, expect } from 'vitest';
import { foldEdits } from '../../../../tools/utils/refactor/foldEdits';

const read = () => 'aaa bbb ccc';

describe('foldEdits', () => {
  it('applies several edits to one file without shifting later offsets', () => {
    const out = foldEdits(
      [
        { file: '/f', start: 0, end: 3, text: 'XXXXX' },
        { file: '/f', start: 8, end: 11, text: 'Z' },
      ],
      read,
    );
    expect(out.get('/f')).toBe('XXXXX bbb Z');
  });

  it('drops an exact duplicate edit', () => {
    const e = { file: '/f', start: 4, end: 7, text: 'Q' };
    expect(foldEdits([e, { ...e }], read).get('/f')).toBe('aaa Q ccc');
  });

  it('throws when two different edits overlap, naming the file', () => {
    expect(() =>
      foldEdits(
        [
          { file: '/f', start: 0, end: 5, text: 'a' },
          { file: '/f', start: 3, end: 7, text: 'b' },
        ],
        read,
      ),
    ).toThrow('/f');
  });
});
