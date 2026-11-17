// @vitest-environment jsdom
/**
 * A browser drops a malformed SVG image without a word, and an element whose
 * `filter`, `clip-path` or `fill` names a missing id renders as nothing: the frame
 * or tablet just vanishes. The generators splice filters and clips into each
 * other's documents (inkWearSvg wraps them all), so every token is checked whole.
 */
import { describe, expect, it } from 'vitest';
import { antiqueChromeCss } from '../../../src/utils/antiqueChrome/antiqueChromeCss';

const svgs = [...antiqueChromeCss().matchAll(/url\("data:image\/svg\+xml,([^"]+)"\)/g)].map((m) =>
  decodeURIComponent(m[1]!),
);

describe('antiqueChromeCss', () => {
  it('emits every image token as a well-formed SVG', () => {
    expect(svgs.length).toBeGreaterThan(10);
    for (const svg of svgs) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror'), svg.slice(0, 200)).toBeNull();
    }
  });

  it('defines every id a token references, once', () => {
    for (const svg of svgs) {
      const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, svg.slice(0, 200)).toBe(ids.length);
      for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g))
        expect(ids, svg.slice(0, 200)).toContain(ref);
    }
  });
});
