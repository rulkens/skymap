/**
 * findCssReferences: file paths in a stylesheet (`composes ... from`, `@import`,
 * `url()`), found by regex since CSS needs no parse for these forms.
 *
 * `from global`, schemes (`https:`, `data:`), `#fragment`, `//host` and
 * root-absolute `/x` are not files of this project and are skipped. Unquoted or
 * dot-less values such as `url(a.png)` are relative in CSS and returned as written.
 */

import type { PathReference } from './@types/PathReference';

const FORMS = [
  /\bcomposes\s*:[^;{}]*?\bfrom\s+(['"])([^'"\n]+)\1/dg,
  /@import\s+(?:url\(\s*)?(['"])([^'"\n]+)\1/dg,
  /\burl\(\s*(['"])([^'"\n]+)\1\s*\)/dg,
  /\burl\(\s*()([^'")\s]+)\s*\)/dg,
];

const NOT_A_FILE = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i;

export function findCssReferences(text: string): PathReference[] {
  const found = new Map<number, PathReference>();
  for (const form of FORMS) {
    for (const m of text.matchAll(form)) {
      const value = m[2]!;
      if (NOT_A_FILE.test(value)) continue;
      const start = m.indices![2]![0];
      found.set(start, { start, end: start + value.length, value });
    }
  }
  return [...found.values()].sort((a, b) => a.start - b.start);
}
