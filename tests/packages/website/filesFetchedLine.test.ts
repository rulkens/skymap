import { describe, expect, it } from 'vitest';

import { filesFetchedLine } from '../../../packages/website/src/utils/filesFetchedLine';

const SITE = 'https://skymap.rulkens.com';

describe('filesFetchedLine', () => {
  it('counts the files and names the one host they came from', () => {
    expect(filesFetchedLine([`${SITE}/privacy/`, `${SITE}/a.css`, `${SITE}/b.woff2`])).toBe(
      'Your browser has fetched 3 files to show you this page, all from skymap.rulkens.com. It did the counting, and we never see the result.',
    );
  });

  it('names every host, so a file from elsewhere is not hidden', () => {
    const line = filesFetchedLine([
      `${SITE}/privacy/`,
      'https://skymap-data.rulkens.com/x.avif',
      'https://example.org/t.js',
    ]);
    expect(line).toContain('all from example.org, skymap-data.rulkens.com and skymap.rulkens.com.');
  });

  it('says one file in the singular', () => {
    expect(filesFetchedLine([`${SITE}/privacy/`])).toContain('fetched 1 file to');
  });
});
