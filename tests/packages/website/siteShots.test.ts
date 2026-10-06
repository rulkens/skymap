/**
 * The shot manifest against the app and the site. A link the app's parser
 * reads as "home" would make the runner publish a picture of the wrong place
 * without failing; an id nothing shows is a committed image nobody sees.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { linkIntentFrom } from '../../../src/utils/url/linkIntentFrom';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';
import { siteShotActions } from '../../../tools/site/utils/siteShotActions';
import { siteShotUrl } from '../../../tools/site/utils/siteShotUrl';

const ROOT = resolve(import.meta.dirname, '../../..');
const sourceOf = (dir: string): string =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(astro|ts)$/.test(file) && !file.endsWith('siteShots.ts'))
    .map((file) => readFileSync(join(ROOT, dir, file), 'utf8'))
    .join('\n');
const consumers = sourceOf('packages/website/src') + sourceOf('tools/site');

describe('shot manifest', () => {
  it('ids are unique', () => {
    const ids = SITE_SHOTS.map((shot) => shot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a picture the pages show has words for it; a thumbnail has its place name instead', () => {
    for (const shot of SITE_SHOTS.filter((s) => !s.id.startsWith('place-'))) {
      expect(shot.caption, shot.id).not.toBe('');
      expect(shot.alt, shot.id).not.toBe('');
    }
  });
});

describe.each(SITE_SHOTS)('shot $id', (shot) => {
  it('the app parses its link as a place to go, with a pinned time where it names one', () => {
    const intent = linkIntentFrom(shot.link);
    expect(intent.view.kind).not.toBe('home');
    const t = parseHashParams(shot.link).get('t');
    if (t !== undefined) expect(intent.t).toBe(Date.parse(t));
  });

  it('is shown by a page or used by a tool', () => {
    expect(consumers.includes(`'${shot.id}'`) || consumers.includes(`"${shot.id}"`), shot.id).toBe(
      true,
    );
  });

  it('its settings turn into actions and its address keeps the link, unless the runner starts a tour step itself', () => {
    expect(siteShotActions(shot).length).toBeGreaterThan(0);
    const url = siteShotUrl('http://localhost:1/', shot);
    expect(url.startsWith('http://localhost:1/?cinema')).toBe(true);
    expect(url.endsWith(`#${shot.link}`)).toBe(shot.settings?.tourStep === undefined);
  });
});
