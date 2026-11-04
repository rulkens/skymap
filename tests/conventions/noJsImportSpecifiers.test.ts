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
];
const SKIP = ['tools/stars-rs/target', 'tools/vendor-types', '/node_modules/'];
const JS_SUFFIX = /\.[cm]?js$/;

const files = ROOTS.flatMap((root) => walkFiles(root, ['.ts', '.tsx', '.cts', '.mts'])).filter(
  (file) => !SKIP.some((skip) => file.includes(skip)),
);

describe('no relative import names a .js file', () => {
  it('every relative specifier is extensionless or a non-JS asset', () => {
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((file) => {
      const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
      return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
        .map((decl) => decl.getModuleSpecifierValue())
        .filter((spec): spec is string => spec?.startsWith('.') === true && JS_SUFFIX.test(spec))
        .map((spec) => `${file}: '${spec}'`);
    });
    expect(offenders, `${offenders.join('\n')}\nDrop the suffix.`).toEqual([]);
  });
});
