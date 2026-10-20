import { describe, expect, it } from 'vitest';

import { stampJsxSource } from '../../../tools/site/utils/stampJsxSource';

describe('jsxSourceAttributes', () => {
  it('adds file and loc to host elements, not to components', () => {
    const code = ['const a = (', '  <div><p>Hi</p><Foo /></div>', ');'].join('\n');
    const out = stampJsxSource(code, '/site/A.tsx');

    // Astro's loc is the position after the opening tag: `  <div>` is 7 characters, so 8; `<p>` adds 3, so 11.
    expect(out).toContain('<p data-astro-source-file="/site/A.tsx" data-astro-source-loc="2:11">');
    expect(out).toContain('<div data-astro-source-file="/site/A.tsx" data-astro-source-loc="2:8">');
    expect(out).toContain('<Foo />');
  });

  it('stamps a self-closing host element and leaves fragments alone', () => {
    const out = stampJsxSource('const a = <><br /></>;', '/site/B.tsx');
    expect(out).toBe(
      'const a = <><br data-astro-source-file="/site/B.tsx" data-astro-source-loc="1:19" /></>;',
    );
  });
});
