import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { planExtract } from '../../../../tools/utils/refactor/planExtract';
import { resolveSymbol } from '../../../../tools/utils/refactor/resolveSymbol';

// In-memory Projects mirror the planInline/planDelete fixtures: seed a tiny module
// graph, resolve the target the way the CLI does, run the planner, then read back
// the resulting files. planExtract validates (dest-free + no shared deps) before
// mutating and never saves, so every assertion reads from the live Project.
function projectWith(files: Record<string, string>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('planExtract', () => {
  it('moves the declaration to dest and repoints importers', () => {
    const project = projectWith({
      '/src/util.ts': 'export function helper(x: number) { return x + 1; }',
      '/src/source.ts':
        "import { helper } from './util';\nexport function target(x: number) { return helper(x) * 2; }",
      '/src/app.ts': "import { target } from './source';\nexport const y = target(3);",
    });
    const resolved = resolveSymbol(project, { file: '/src/source.ts', symbol: 'target' });

    planExtract(project, resolved, '/src/target.ts');

    // The external importer now imports target from dest; the symbol is gone from
    // the source; dest carries the import the moved code needed.
    const app = project.getSourceFileOrThrow('/src/app.ts').getText();
    expect(app).toMatch(/from '\.\/target'/);
    const source = project.getSourceFileOrThrow('/src/source.ts').getText();
    expect(source).not.toContain('function target');
    expect(source).not.toContain('helper'); // the carried import was pruned
    const dest = project.getSourceFileOrThrow('/src/target.ts').getText();
    expect(dest).toContain('export function target');
    expect(dest).toMatch(/import \{ helper \} from ['"]\.\/util['"]/);
  });

  it('re-imports into the source when the source still uses the symbol', () => {
    const project = projectWith({
      '/src/source.ts':
        'export function target() { return 1; }\nexport function keeper() { return target() + 2; }',
      '/src/app.ts': "import { target } from './source';\nexport const y = target();",
    });
    const resolved = resolveSymbol(project, { file: '/src/source.ts', symbol: 'target' });

    planExtract(project, resolved, '/src/target.ts');

    // keeper still calls target, so an import of target from dest is added back to
    // the source.
    const source = project.getSourceFileOrThrow('/src/source.ts').getText();
    expect(source).toMatch(/import \{ target \} from ['"]\.\/target['"]/);
    expect(source).toContain('function keeper');
    expect(source).not.toContain('function target');
  });

  it('drags an exclusive local dep into dest', () => {
    const project = projectWith({
      '/src/source.ts':
        'function h(n: number) { return n * 10; }\nexport function target(n: number) { return h(n) + 1; }',
      '/src/app.ts': "import { target } from './source';\nexport const y = target(2);",
    });
    const resolved = resolveSymbol(project, { file: '/src/source.ts', symbol: 'target' });

    planExtract(project, resolved, '/src/target.ts');

    // The exclusive helper `h` travels with `target` and stays unexported in dest;
    // the source no longer declares it.
    const dest = project.getSourceFileOrThrow('/src/target.ts').getText();
    expect(dest).toContain('function h');
    expect(dest).toContain('export function target');
    expect(dest).not.toMatch(/export function h/);
    const source = project.getSourceFileOrThrow('/src/source.ts').getText();
    expect(source).not.toContain('function h');
  });

  it('throws and names the shared dep when a local dep is shared', () => {
    const original =
      'function shared(n: number) { return n + 1; }\n' +
      'export function target(n: number) { return shared(n); }\n' +
      'export function other(n: number) { return shared(n) * 2; }';
    const project = projectWith({
      '/src/source.ts': original,
      '/src/app.ts': "import { target } from './source';\nexport const y = target(1);",
    });
    const resolved = resolveSymbol(project, { file: '/src/source.ts', symbol: 'target' });

    // `shared` is used by both the moving target and the staying `other`, so the
    // extraction refuses and names it — and nothing is mutated (all-or-nothing).
    expect(() => planExtract(project, resolved, '/src/target.ts')).toThrow(/shared/);
    expect(project.getSourceFile('/src/target.ts')).toBeUndefined();
    expect(project.getSourceFileOrThrow('/src/source.ts').getText()).toBe(original);
  });

  it('refuses when dest already exists', () => {
    const project = projectWith({
      '/src/source.ts': 'export function target() { return 1; }',
      '/src/dest.ts': 'export const z = 1;',
    });
    const resolved = resolveSymbol(project, { file: '/src/source.ts', symbol: 'target' });

    expect(() => planExtract(project, resolved, '/src/dest.ts')).toThrow(/dest\.ts/);
  });
});
