/**
 * The desktop app runs in three contexts the bundler and sandbox keep apart: Electron main, the
 * sandboxed preload, and two renderer pages (control, brand). Its top-level folder says which, so a
 * prefix check guards the line a stray import would cross silently: `electron` in the `file://`
 * page bundle, React in main. The root `@types/ data/` are what crosses a process boundary,
 * so they stay runtime-neutral. Empty allowlist; the rules are docs/DESKTOP.md's layout table.
 */
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

const SRC = 'packages/desktop/src';
const SHARED = ['@types', 'data'].map((dir) => `${SRC}/${dir}/`);
const under = (folder: string) => `${SRC}/${folder}/`;

const NODE = new Set(builtinModules);
const isElectron = (spec: string) => spec === 'electron' || spec.startsWith('electron/');
const isNode = (spec: string) => spec.startsWith('node:') || NODE.has(spec.split('/')[0]!);
const isReact = (spec: string) => /^react(-dom)?(\/|$)/.test(spec);

/** Each rule: the folder it sweeps and what a file there may not import (package name or repo path). */
const RULES = {
  'root @types/data stay runtime-neutral': {
    files: 'shared',
    banned: (spec, target) =>
      isElectron(spec) ||
      isNode(spec) ||
      isReact(spec) ||
      ['main', 'preload', 'control', 'brand'].some((f) => target.startsWith(under(f))),
  },
  'main never imports React, CSS or a page': {
    files: 'main',
    banned: (spec, target) =>
      isReact(spec) ||
      spec.endsWith('.css') ||
      ['control', 'brand', 'preload'].some((f) => target.startsWith(under(f))),
  },
  'preload imports only electron and the root contract': {
    files: 'preload',
    banned: (spec, target) =>
      !isElectron(spec) && !(spec.startsWith('.') && SHARED.some((s) => target.startsWith(s))),
  },
  'control never imports electron, Node, main, preload, brand or tools/': {
    files: 'control',
    banned: (spec, target) =>
      isElectron(spec) ||
      isNode(spec) ||
      target.startsWith('tools/') ||
      ['main', 'preload', 'brand'].some((f) => target.startsWith(under(f))),
  },
  'brand never imports electron, Node, main, preload or tools/': {
    files: 'brand',
    banned: (spec, target) =>
      isElectron(spec) ||
      isNode(spec) ||
      target.startsWith('tools/') ||
      ['main', 'preload'].some((f) => target.startsWith(under(f))),
  },
} satisfies Record<string, { files: string; banned: (spec: string, target: string) => boolean }>;

const sourceFiles = walkFiles(SRC, ['.ts', '.tsx', '.cts']);
const filesFor = (folder: string): string[] =>
  folder === 'shared'
    ? sourceFiles.filter((file) => SHARED.some((s) => file.startsWith(s)))
    : sourceFiles.filter((file) => file.startsWith(under(folder)));

/** Every import and re-export specifier, with its repo-relative target when it is a relative path. */
function specifiersOf(file: string): { spec: string; target: string }[] {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((spec): spec is string => spec !== undefined)
    .map((spec) => ({
      spec,
      target: spec.startsWith('.')
        ? relative(process.cwd(), resolve(join(dirname(file), spec))).replace(/\\/g, '/')
        : '',
    }));
}

describe('desktop import boundary between processes', () => {
  it.each(Object.entries(RULES))('%s', (_name, { files, banned }) => {
    const swept = filesFor(files);
    expect(swept.length).toBeGreaterThan(0);
    const offenders = swept.flatMap((file) =>
      specifiersOf(file)
        .filter(({ spec, target }) => banned(spec, target))
        .map(({ spec }) => `${file} imports '${spec}'`),
    );
    expect(
      offenders,
      `${offenders.join('\n')}\nMove the shared piece to ${SRC}/{@types,data}/ (runtime-neutral), ` +
        'or keep it in the one process that uses it (docs/DESKTOP.md, layout).',
    ).toEqual([]);
  });
});
