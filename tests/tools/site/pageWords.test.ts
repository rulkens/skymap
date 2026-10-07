import { describe, expect, it } from 'vitest';

import { pageWords } from '../../../tools/site/utils/pageWords';

describe('pageWords', () => {
  it('leaves out the head, scripts and the list of sources', () => {
    const html =
      '<html><head><meta content="A row."></head><body><p>A row.</p><script>var a = "A row."</script>' +
      '<details class="sources small" data-astro-cid-x><ol><li>A row. <a href="#">NASA</a></li></ol></details>' +
      '<p>After.</p></body></html>';
    expect(pageWords(html)).toBe('A row. After.');
  });

  it('reads a sentence through a tag, an entity and a line break as the row has it', () => {
    expect(
      pageWords('<p>Pass <code>--only</code> and\n  the tool&#39;s &amp; &quot;ours&quot;.</p>'),
    ).toBe('Pass --only and the tool\'s & "ours".');
  });
});
