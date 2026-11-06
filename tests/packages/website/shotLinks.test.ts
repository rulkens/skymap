/**
 * A shot's "Open this view" must open what the picture shows. A link can switch no layer on, so a shot
 * that has the runner switch one on gets no link (utils/shotLink.ts, reading through utils/shotHash.ts). What the runner switches on is read
 * from its own actions, so a new layer setting the gate does not know fails here; and the site reads a
 * shot's address only through the gate (utils/shotHash.ts), so a new component cannot print the bare one.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { UnknownAction } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { SITE_SHOTS } from '../../../packages/website/src/data/siteShots';
import { shotLink } from '../../../packages/website/src/utils/shotLink';
import { siteShotActions } from '../../../tools/site/utils/siteShotActions';

const SRC = resolve(import.meta.dirname, '../../../packages/website/src');
const GATE = 'utils/shotHash.ts';

// A layer switched on: a `set…Enabled` / `set…Visible` / setVisibility action whose value is on.
const switchesOn = ({ type, payload }: UnknownAction & { payload?: unknown }) =>
  /(Enabled|Visible|setVisibility)$/.test(type) &&
  (payload === true ||
    (typeof payload === 'object' &&
      payload !== null &&
      ('enabled' in payload ? payload.enabled : 'on' in payload && payload.on) === true));

describe('shot links', () => {
  it('a shot whose runner switches a layer on has no link, and every other shot keeps its own', () => {
    const wrong = SITE_SHOTS.filter((shot) => {
      const layered = siteShotActions(shot).some(switchesOn);
      return layered ? shotLink(shot.id) !== undefined : shotLink(shot.id) !== shot.link;
    }).map((shot) => shot.id);
    expect(wrong).toEqual([]);
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
