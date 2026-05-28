/**
 * parseNoirLabPage — happy-path extraction from an archived NOIRLab image
 * page.  The handler is pure (HTML string in, ResolvedMedia out), so the
 * fixture-driven tests below need no network or filesystem stubs beyond a
 * single readFileSync of the committed page snapshot.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNoirLabPage } from '../../../tools/famous-curator/plugin/noirlabResolver';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'noirlab-noao-m94.html');
const PAGE_URL = 'https://noirlab.edu/public/images/noao-m94/';

describe('parseNoirLabPage', () => {
  const html = readFileSync(FIXTURE_PATH, 'utf-8');
  const result = parseNoirLabPage(html, PAGE_URL);

  it('parses Large JPEG URL from the M94 fixture', () => {
    expect(result?.directUrl).toBe(
      'https://storage.noirlab.edu/media/archives/images/large/noao-m94.jpg',
    );
  });

  it('parses author string with inner anchors stripped', () => {
    expect(result?.author).toBe('Hillary Mathis, N.A.Sharp/NOIRLab/NSF/AURA/');
  });

  it('returns the hardcoded CC BY 4.0 licence', () => {
    expect(result?.license).toBe('CC BY 4.0');
  });

  it('echoes the input page URL as sourceUrl', () => {
    expect(result?.sourceUrl).toBe(PAGE_URL);
  });
});
