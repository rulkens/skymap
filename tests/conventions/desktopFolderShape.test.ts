/**
 * The desktop app's folder shape (docs/DESKTOP.md, layout): process first, then concern module, then
 * role. Only the top level says which runtime a file runs in, so the import boundary
 * (desktopImportBoundary.test.ts) can guard it by prefix; inside a process each concern module holds
 * only role folders, the ADR 0014 shape. The 15-file cap and bag names are layerFolderShape's.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'packages/desktop/src';
const PROCESS_FOLDERS = ['@types', 'data', 'utils', 'main', 'preload', 'control', 'brand'];
const MAIN_ROLES = ['@types', 'data', 'utils'];
const PAGE_ROLES = ['@types', 'data', 'utils', 'components'];

const entries = (dir: string) => readdirSync(dir, { withFileTypes: true });
const filesIn = (dir: string) =>
  entries(dir)
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name);
const foldersIn = (dir: string) =>
  entries(dir)
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
const allFiles = (dir: string): string[] =>
  entries(dir).flatMap((e) =>
    e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
const allFolders = (dir: string): string[] =>
  foldersIn(dir).flatMap((name) => [join(dir, name), ...allFolders(join(dir, name))]);

/** `<root>/<module>/` folders: everything at the root that is not a role folder of its own. */
const modulesOf = (root: string, roles: readonly string[]) =>
  foldersIn(root).filter((name) => !roles.includes(name));

/** A module holds `.ts` files and its role folders, nothing else. */
function moduleViolations(dir: string, roles: readonly string[]): string[] {
  return [
    ...filesIn(dir)
      .filter((f) => !f.endsWith('.ts'))
      .map((f) => `${dir}/${f}: a module root holds only .ts files`),
    ...foldersIn(dir)
      .filter((f) => !roles.includes(f))
      .map((f) => `${dir}/${f}/: a module holds only ${roles.join(', ')}`),
  ];
}

describe('desktop folder shape', () => {
  it('src/ holds exactly the process folders and no files', () => {
    expect(filesIn(SRC)).toEqual([]);
    expect(foldersIn(SRC).sort()).toEqual([...PROCESS_FOLDERS].sort());
  });

  it('.tsx lives only in the pages and .cts only in preload/', () => {
    const wrong = allFiles(SRC).filter(
      (f) =>
        (f.endsWith('.tsx') && !/\/(control|brand)\//.test(f)) ||
        (f.endsWith('.cts') && !f.startsWith(`${SRC}/preload/`)) ||
        (f.startsWith(`${SRC}/preload/`) && !f.endsWith('.cts')),
    );
    expect(wrong).toEqual([]);
  });

  it('main/ root holds main.ts and @types/, everything else in concern modules', () => {
    expect(filesIn(`${SRC}/main`)).toEqual(['main.ts']);
    const roles = foldersIn(`${SRC}/main`).filter((f) => MAIN_ROLES.includes(f));
    expect(roles).toEqual(['@types']);
    const violations = modulesOf(`${SRC}/main`, MAIN_ROLES).flatMap((m) =>
      moduleViolations(`${SRC}/main/${m}`, MAIN_ROLES),
    );
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('control/ root holds the page entry, everything else in concern modules', () => {
    const entry = ['control.css', 'controlChrome.module.css', 'index.html', 'main.tsx'];
    expect(filesIn(`${SRC}/control`).sort()).toEqual(entry);
    expect(foldersIn(`${SRC}/control`).filter((f) => PAGE_ROLES.includes(f))).toEqual([]);
    const violations = modulesOf(`${SRC}/control`, PAGE_ROLES).flatMap((m) =>
      moduleViolations(`${SRC}/control/${m}`, PAGE_ROLES),
    );
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('a components/<Name>/ folder holds only that component, its styles, constants and hooks', () => {
    const componentDirs = allFolders(SRC).filter((dir) => /\/components\/[^/]+$/.test(dir));
    expect(componentDirs.length).toBeGreaterThan(0);
    const violations = componentDirs.flatMap((dir) => {
      const name = dir.split('/').at(-1)!;
      const allowed = new Set([`${name}.tsx`, `${name}.module.css`, `${name}.constants.ts`]);
      const isHook = (f: string) => /^use[A-Z]\w*(\.constants)?\.ts$/.test(f);
      return [
        ...filesIn(dir)
          .filter((f) => !allowed.has(f) && !isHook(f))
          .map((f) => `${dir}/${f}`),
        ...foldersIn(dir).map((f) => `${dir}/${f}/: no folders inside a component`),
      ];
    });
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
