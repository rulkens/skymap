// @vitest-environment jsdom
/**
 * readHashBody — the `#`-stripping behaviour, against a real `window.location`.
 *
 * jsdom is required: the function's whole job is reading the live address bar,
 * and the node path (no `window` at all) is covered separately in
 * `hashSeamWithoutWindow.test.ts`.
 *
 * The `#` strip is the bug worth pinning. Leaving the sigil on makes
 * `parseHashParams` read the first key as `#focus`, which no source claims, so
 * every deep link silently degrades to "no params present" rather than failing
 * loudly anywhere.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { readHashBody } from '../../../src/services/url/readHashBody';

describe('readHashBody', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('strips the leading #', () => {
    window.history.replaceState(null, '', '/#focus=m31&t=2026-07-29T12:00:00.000Z');

    expect(readHashBody()).toBe('focus=m31&t=2026-07-29T12:00:00.000Z');
  });

  it('reports an empty body for a hashless URL', () => {
    expect(readHashBody()).toBe('');
  });
});
