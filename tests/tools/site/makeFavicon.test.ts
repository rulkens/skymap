// The favicon is a committed output of tools/site/makeFavicon.ts: a mark change without a re-run would
// leave the web app and the site on the old icon while the desktop app draws the new one.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { skymapIcon } from '../../../packages/website/src/utils/skymapIcon';

it('public/favicon.svg is the mark as makeFavicon writes it', () => {
  expect(readFileSync('public/favicon.svg', 'utf8')).toBe(skymapIcon('rounded', 'small'));
});
