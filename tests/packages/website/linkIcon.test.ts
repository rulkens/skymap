import { describe, expect, it } from 'vitest';

import { linkIcon } from '../../../packages/website/src/utils/linkIcon';

describe('linkIcon', () => {
  it.each([
    ['/home/', 'visitor'],
    ['/home/classroom/', 'classroom'],
    ['/home/domes/#contact', 'dome'],
    ['/home/docs/', 'docs'],
    ['/home/docs/guide/sharing/', 'docs'],
    // A deeper page with an icon of its own is found before the section it is in.
    ['/home/docs/cite/', 'cite'],
    ['/home/docs/credits/', 'credits'],
    ['https://github.com/rulkens/skymap/issues', 'code'],
    ['https://www.cosmos.esa.int/web/gaia/dr3', 'outbound'],
  ])('%s carries %s', (href, icon) => {
    expect(linkIcon(href, '/home/')).toBe(icon);
  });

  it.each(['#contact', '/home/_astro/saturn-1920.abc.webp', '/app/'])(
    '%s keeps the plain marker',
    (href) => {
      expect(linkIcon(href, '/home/')).toBeUndefined();
    },
  );

  it('reads the same pages at the root', () => {
    expect(linkIcon('/science/', '/')).toBe('science');
    expect(linkIcon('/', '/')).toBe('visitor');
  });
});
