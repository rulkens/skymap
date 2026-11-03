import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { FeatureSlide } from '../../../packages/website/src/@types/FeatureSlide';
import * as features from '../../../packages/website/src/content/pages/features/features.data';
import { fact } from '../../../packages/website/src/data/fact';
import { SITE_LOOPS } from '../../../packages/website/src/data/siteLoops';
import { pictureAccent } from '../../../tools/site/utils/pictureAccent';

const SHOTS = resolve(import.meta.dirname, '../../../packages/website/src/assets/shots');
const files = readdirSync(SHOTS);
const slides = Object.values(features).filter(Array.isArray).flat() as FeatureSlide[];

// The smallest file of a shot, or of the still a film opens on.
const pictureOf = (view: string) => {
  const id = SITE_LOOPS.find((loop) => loop.id === view)?.shot ?? view;
  const widths = files
    .map((name) => new RegExp(`^${id}-(\\d+)\\.webp$`).exec(name)?.[1])
    .filter((w): w is string => Boolean(w))
    .map(Number);
  return join(SHOTS, `${id}-${Math.min(...widths)}.webp`);
};

describe('the Features galleries', () => {
  it('give each slide a figure its row can set large', () => {
    for (const slide of slides.filter((s) => s.fact)) {
      expect(fact(slide.fact!).figure, `${slide.view}: ${slide.fact}`).toBeDefined();
    }
  });

  // A picture shot again changes its colour: the failure prints the line to paste into features.data.ts.
  it('take each slide’s accent from its own picture', async () => {
    const wrong: string[] = [];
    for (const slide of slides) {
      const sampled = await pictureAccent(pictureOf(slide.view));
      if (sampled !== slide.accent) wrong.push(`${slide.view}: ${slide.accent} → ${sampled}`);
    }
    expect(wrong).toEqual([]);
  });
});
