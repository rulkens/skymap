/**
 * The structure check is only worth running if it names the right side of a mismatch and at the
 * right level: an h3 renamed on the page must not pass because the same text is an h2 elsewhere.
 */
import { describe, expect, it } from 'vitest';

import { structureDrift } from '../../../tools/site/utils/structureDrift';

const structure = {
  job: 'Why Skymap?',
  sections: [
    { heading: 'Flight', job: 'a', parts: [{ heading: 'Start', job: 'b' }] },
    { heading: 'Places', job: 'c' },
  ],
};

describe('structureDrift', () => {
  it('finds no problem when the page and the file agree', () => {
    expect(structureDrift(structure, ['Flight', 'Places'], ['Start'])).toEqual([]);
  });

  it('names a heading the file has and the page lacks, and the other way round', () => {
    const problems = structureDrift(structure, ['Flight', 'Closing'], ['Start']);
    expect(problems).toEqual([
      'h2 "Places" is in the structure file, not on the page',
      'h2 "Closing" is on the page, not in the structure file',
    ]);
  });

  it('compares headings with whitespace folded', () => {
    expect(structureDrift(structure, ['  Flight\n', 'Places'], ['Start '])).toEqual([]);
  });

  it('keeps h2 and h3 apart', () => {
    const problems = structureDrift(structure, ['Flight', 'Places', 'Start'], []);
    expect(problems).toContain('h2 "Start" is on the page, not in the structure file');
    expect(problems).toContain('h3 "Start" is in the structure file, not on the page');
  });

  it('rejects parts of a part, which the page has no level for', () => {
    const deep = {
      job: 'x',
      sections: [
        {
          heading: 'A',
          job: 'a',
          parts: [{ heading: 'B', job: 'b', parts: [{ heading: 'C', job: 'c' }] }],
        },
      ],
    };
    expect(structureDrift(deep, ['A'], ['B'])).toEqual(['"B" has parts; the page has no h4 level']);
  });
});
