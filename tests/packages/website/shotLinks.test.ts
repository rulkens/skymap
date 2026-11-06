/**
 * A shot's "Open this view" must open what the picture shows. Every layer or caption switch a shot makes
 * rides its link as `layers=` (utils/shotHash.ts), so the runner switches none itself: a new settings key
 * that dispatches a switch fails here until shotLayerSwitches knows it. And the site reads a shot's address
 * only through the gate, so a new component cannot print the bare one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { UnknownAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { shotHash } from '../../../packages/website/src/utils/shotHash';
import { parseHashParams } from '../../../src/utils/url/parseHashParams';
import { parseLayerSwitches } from '../../../src/utils/url/parseLayerSwitches';
import { siteShotActions } from '../../../tools/site/utils/siteShotActions';

const SRC = resolve(import.meta.dirname, '../../../packages/website/src');
const GATE = 'utils/shotHash.ts';

// A layer or caption switched on or off: a `set…Enabled` / `set…Visible` / setVisibility action with an on/off payload.
const switchesLayer = ({ type, payload }: UnknownAction & { payload?: unknown }) =>
  /(Enabled|Visible|setVisibility)$/.test(type) &&
  (typeof payload === 'boolean' ||
    (typeof payload === 'object' && payload !== null && ('enabled' in payload || 'on' in payload)));

describe('shot links', () => {
  it('the runner switches no layer or caption itself: every switch rides the link', () => {
    const wrong = SITE_SHOTS.filter((shot) => siteShotActions(shot).some(switchesLayer)).map(
      (shot) => shot.id,
    );
    expect(wrong).toEqual([]);
  });

  it('every switch a shot writes is one the app reads', () => {
    const unread = SITE_SHOTS.flatMap((shot) =>
      parseLayerSwitches(parseHashParams(shotHash(shot)).get('layers') ?? '').unknown.map(
        (token) => `${shot.id}: ${token}`,
      ),
    );
    expect(unread).toEqual([]);
  });

  it("only the gate reads a shot's link", () => {
    const readers = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(astro|mdx|tsx?)$/.test(name) && !name.endsWith('.d.ts'))
      .filter((name) => name !== GATE && name !== 'data/siteShots.ts')
      .filter((name) => {
        const text = readFileSync(join(SRC, name), 'utf8');
        if (!/\b(siteShot|SITE_SHOTS|SiteShot)\b/.test(text)) return false;
        // A film's clock reads the time the picture was taken at; that prints no address.
        const code = text.replace(/linkTime\(siteShot\([^)]*\)\.link\)/g, '');
        return /(?<!styles)\.link\b|\{[^}]*\blink\b[^}]*\}\s*=/.test(code);
      });
    expect(readers).toEqual([]);
  });
});
