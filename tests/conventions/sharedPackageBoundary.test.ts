/**
 * packages/shared is a leaf (ADR 0017): the app and the tool apps import it, it imports only itself
 * and npm packages. A relative specifier that leaves `packages/shared/src/` would make every consumer
 * drag that file's tree along, so each TS import, re-export and `import()`, and each CSS `composes`
 * and `@import`, must resolve inside it. Empty allowlist.
 */
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssSpecifiers } from '../helpers/conventions/cssSpecifiers';
import { tsSpecifiers } from '../helpers/conventions/tsSpecifiers';
import { walkFiles } from '../helpers/conventions/walkFiles';

const SRC = 'packages/shared/src';

const files = walkFiles(SRC, ['.ts', '.tsx', '.css']);
const ALLOWED: readonly string[] = [];

describe('packages/shared imports nothing outside itself', () => {
  expect(files.length).toBeGreaterThan(0);

  it.each(files.filter((file) => !ALLOWED.includes(file)))('%s', (file) => {
    const outside = (file.endsWith('.css') ? cssSpecifiers(file) : tsSpecifiers(file))
      .filter((spec) => spec.startsWith('.'))
      .filter((spec) => {
        const target = relative(process.cwd(), resolve(join(dirname(file), spec)));
        return !target.replace(/\\/g, '/').startsWith(`${SRC}/`);
      });
    expect(
      outside,
      'The shared package is a leaf: move the imported file into packages/shared/src (with its ' +
        'own imports), or keep this file in its consumer.',
    ).toEqual([]);
  });
});
