/**
 * Every class a website CSS module declares is used: read as `styles.x` / `styles['x']` from a file that
 * imports the module, or pulled in by `composes: x from '…'`. A dead class is a rule nobody sees that the
 * next reader still has to reason about. The CSS-modules config converts no names, so `.skip-link` is read
 * as `styles['skip-link']`. A module read by key (`styles[size]`) counts a class as used when its name
 * is a string literal somewhere in the site's sources.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssStatements } from '../../helpers/conventions/cssStatements';
import { walkFiles } from '../../helpers/conventions/walkFiles';

const SITE = 'packages/website/src';

const modules = walkFiles(SITE, ['.module.css']);
const sources = walkFiles(SITE, ['.ts', '.tsx', '.astro', '.mdx']);

const used = new Map<string, Set<string>>(modules.map((m) => [m, new Set()]));
const readByKey = new Set<string>();
const use = (module: string, names: Iterable<string>) => {
  for (const name of names) used.get(module)?.add(name);
};

for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const [, local, path] of text.matchAll(
    /import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g,
  )) {
    const module = join(dirname(file), path!);
    const reads = text.matchAll(
      new RegExp(`\\b${local}(?:\\.([\\w$]+)|\\[\\s*(['"]?)([^\\]'"]+)\\2\\s*\\])`, 'g'),
    );
    for (const [, dotted, quote, keyed] of reads) {
      if (dotted) use(module, [dotted]);
      else if (quote) use(module, [keyed!]);
      else readByKey.add(module);
    }
  }
}

for (const module of modules) {
  for (const { kind, text } of cssStatements(readFileSync(module, 'utf8'))) {
    const composes =
      kind === 'declaration' && /^composes\s*:\s*(.+?)(?:\s+from\s+['"](.+)['"])?$/.exec(text);
    if (composes)
      use(composes[2] ? join(dirname(module), composes[2]) : module, composes[1]!.split(/\s+/));
  }
}

const literals = new Set(
  sources.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/['"]([\w-]+)['"]/g)].map((match) => match[1]),
  ),
);

function declaredClasses(module: string): Set<string> {
  const blocks = cssStatements(readFileSync(module, 'utf8')).filter(
    (s) => s.kind === 'block' && !s.text.startsWith('@'),
  );
  // An attribute selector's value (`[href$='.pdf']`) is not a class.
  const selectors = blocks.map((b) => b.text.replace(/\[[^\]]*\]/g, ''));
  return new Set(
    selectors.flatMap((s) => [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!)),
  );
}

describe('website CSS modules declare no dead classes', () => {
  expect(modules.length).toBeGreaterThan(0);

  it.each(modules.map((m) => relative(SITE, m)))('%s', (rel) => {
    const module = join(SITE, rel);
    const dead = [...declaredClasses(module)].filter(
      (name) => !used.get(module)?.has(name) && !(readByKey.has(module) && literals.has(name)),
    );
    expect(
      dead,
      `${rel} declares classes nothing reads. Delete each rule, or apply the class: ` +
        "`styles.x` / `styles['x']` from a file importing the module, or `composes: x from '…'` in another.",
    ).toEqual([]);
  });
});
