import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preprocessCSS, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import { customMedia } from '../../../tools/site/customMedia';

// Through Vite's own CSS step, as the site compiles it: a vocabulary taken with `composes` is pasted in raw.
async function compile(files: Record<string, string>, entry: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'custom-media-'));
  for (const [name, code] of Object.entries(files)) writeFileSync(join(dir, name), code);
  const config = await resolveConfig(
    { root: dir, configFile: false, css: { postcss: { plugins: [customMedia()] } } },
    'serve',
  );
  return (await preprocessCSS(files[entry]!, join(dir, entry), config)).code;
}

describe('customMedia', () => {
  it('writes the named query in, in a composed vocabulary and in a nested rule too', async () => {
    const code = await compile(
      {
        'vocab.module.css': '.v { color: red; } @media (--wide) { .v { color: blue; } }',
        'a.module.css':
          ".a { composes: v from './vocab.module.css'; & .b { @media (--narrow) { color: green; } } }",
      },
      'a.module.css',
    );
    expect(code).not.toContain('(--');
    expect(code).toContain('@media (min-width: 901px)');
    expect(code).toContain('@media (max-width: 900px)');
  });

  it('fails on a name it does not know', async () => {
    await expect(
      compile({ 'a.module.css': '@media (--narow) { .a { color: red; } }' }, 'a.module.css'),
    ).rejects.toThrow('No media query is named --narow');
  });
});
