// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { cssSelector } from '../../../packages/website/src/dev/feedback/cssSelector';

describe('cssSelector', () => {
  it('finds back every element of a page with repeated siblings, ids and scoped classes', () => {
    document.body.innerHTML = `
      <main id="main">
        <section class="astro-abc123 stop"><p>one</p><p>two</p><p class="cap">three</p></section>
        <section class="stop"><p>one</p><p>two</p></section>
        <ul><li><a href="#a">a</a></li><li><a href="#b">b</a></li></ul>
        <div id="9bad"><span></span></div>
      </main>`;
    for (const el of document.querySelectorAll('body, body *')) {
      expect(document.querySelector(cssSelector(el)), cssSelector(el)).toBe(el);
    }
  });

  it('prefers a unique id and never spells an astro-scoped class', () => {
    document.body.innerHTML =
      '<main id="main"><section class="astro-abc123 stop"><p>x</p><p>y</p></section></main>';
    expect(cssSelector(document.getElementById('main')!)).toBe('#main');
    const second = document.querySelectorAll('p')[1]!;
    expect(cssSelector(second)).not.toContain('astro-');
  });
});
