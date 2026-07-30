/**
 * The `services/url` DOM seam under vitest's default `node` environment, where
 * `window` genuinely does not exist.
 *
 * These are not SSR smoke tests. The hash read saga reads the hash at saga
 * *start*, and every test in the suite that boots a real store through
 * `createAppStore` forks that saga in this exact environment — so a deleted
 * `typeof window` guard does not fail here in isolation, it takes down a few
 * hundred unrelated tests with `ReferenceError: window is not defined`. Pinning
 * the guard on its own turns that broad, confusing failure into one line naming
 * the cause.
 *
 * No file-level jsdom directive on purpose: the absent `window` is the subject.
 * The suite's setup files add WebGPU constants and (gated on a DOM) React
 * helpers, neither of which introduces a `window` here — the `beforeAll` below
 * asserts that rather than trusting it, so these cases cannot quietly stop
 * exercising the branch they exist for.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { readHashBody } from '../../../src/services/url/readHashBody';
import { writeHashBody } from '../../../src/services/url/writeHashBody';
import { createHashChangeChannel } from '../../../src/services/url/createHashChangeChannel';

describe('the hash seam without a window', () => {
  beforeAll(() => {
    expect(typeof globalThis.window).toBe('undefined');
  });

  it('readHashBody reports an empty body', () => {
    expect(readHashBody()).toBe('');
  });

  it('writeHashBody does nothing instead of dereferencing window.history', () => {
    expect(() => writeHashBody('focus=m31')).not.toThrow();
  });

  it('createHashChangeChannel yields a channel that closes cleanly', () => {
    // A channel that never emits: the consuming saga's `take` parks forever,
    // exactly as it would in a tab whose URL the visitor never changes.
    const channel = createHashChangeChannel();

    expect(() => {
      channel.close();
    }).not.toThrow();
  });
});
