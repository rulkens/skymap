/**
 * Relative imports never name a `.js`, `.mjs` or `.cjs` file: every package resolves with Bundler
 * resolution, so the suffix is noise that a NodeNext habit keeps re-adding (the desktop package once
 * carried 179 of them). Only the `.js` family is banned:
 * `tools/` legitimately imports `.ts`-suffixed paths for the curator plugin.
 */
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

const ROOTS = [
  'src',
  'tools',
  'packages/website/src',
  'packages/desktop/src',
  'packages/desktop/scripts',
  'packages/desktop/tests',
  'packages/studio/src',
];
const SKIP = ['tools/stars-rs/target', 'tools/vendor-types', '/node_modules/'];
const JS_SUFFIX = /\.[cm]?js$/;

const files = ROOTS.flatMap((root) => walkFiles(root, ['.ts', '.tsx', '.cts', '.mts'])).filter(
  (file) => !SKIP.some((skip) => file.includes(skip)),
);

expect(files.length).toBeGreaterThan(0);

// One test per file, as in noInlineTypes: one test parsing the whole tree outgrew the 5 s timeout.
describe('no relative import names a .js file', () => {
  it.each(files)('%s', (file) => {
    const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
    const offenders = [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
      .map((decl) => decl.getModuleSpecifierValue())
      .filter((spec): spec is string => spec?.startsWith('.') === true && JS_SUFFIX.test(spec));
    expect(offenders, 'Drop the suffix.').toEqual([]);
  });
});
