/** The drift check reads headings from built HTML; a heading read wrong (or one from the nav) is a false alarm or a missed drift. */
import { describe, expect, it } from 'vitest';

import { mainHeadings } from '../../../tools/site/utils/mainHeadings';

describe('mainHeadings', () => {
  it('reads h2 and h3 from main only, with tags stripped and entities decoded', () => {
    const html = [
      '<header><h2>Site title</h2></header>',
      '<main id="main"><h1>Page</h1>',
      '<h2 id="a">Flight &amp; <em>tour</em></h2>',
      '<nav><h2>On this page</h2></nav>',
      '<h3 class="x">It&#39;s&nbsp;here</h3>',
      '<h2>Places</h2>',
      '<footer><h3>Foot</h3></footer></main>',
      '<footer><h2>Outside</h2></footer>',
    ].join('\n');
    expect(mainHeadings(html)).toEqual({
      h2: ['Flight & tour', 'Places'],
      h3: ["It's here"],
    });
  });
});
