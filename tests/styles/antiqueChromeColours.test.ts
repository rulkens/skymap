/**
 * The generated chrome SVGs bake their colours in (an SVG in a data URL cannot read
 * a custom property), so `data/ui/antiqueChrome.ts` repeats two of antique.css's
 * tokens. If either side is retuned alone, frames and tablets stop matching the
 * panels they are drawn on.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANTIQUE_CHROME_GROUND, ANTIQUE_CHROME_INK } from '../../src/data/ui/antiqueChrome';

const css = readFileSync('src/styles/antique.css', 'utf8');

function tokenHex(name: string): string {
  const m = new RegExp(`${name}:\\s*rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)`).exec(css);
  expect(m, `${name} as rgb(r, g, b) in antique.css`).not.toBeNull();
  return `#${m!.slice(1, 4).map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
}

describe('antique chrome colours', () => {
  it("bakes antique.css's ink and panel paper into the generated SVGs", () => {
    expect(ANTIQUE_CHROME_INK).toBe(tokenHex('--antique-ink'));
    expect(ANTIQUE_CHROME_GROUND).toBe(tokenHex('--antique-slip'));
  });
});
