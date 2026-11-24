/**
 * collectRefs: every reference to an exported symbol, classified, as the report
 * `refs` prints and every other subcommand previews.
 *
 * The engine answers "where"; the TypeScript 6 parser answers "what kind" and "inside
 * what", per reference. `tests/` is a flag (`inTest`), not a kind, so a call in a test
 * stays a call. The declaration itself is dropped from `refs` and returned as `at`.
 */

import { resolve } from 'node:path';
import type { Engine } from '../../@types/refactor/Engine';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { RefEntry } from '../../@types/refactor/RefEntry';
import type { RefReport } from '../../@types/refactor/RefReport';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import type { SymbolRefKind } from '../../@types/refactor/SymbolRefKind';
import { classifySymbolRef } from './classifySymbolRef';
import { enclosingLabel } from './enclosingLabel';
import { findReferences } from './engine/findReferences';
import { findNameNode } from './findNameNode';
import { locateExport } from './locateExport';
import { parseTs } from './parseTs';
import { rootRelative } from './rootRelative';

const TEST_PATH = /^(packages\/[^/]+\/)?tests\//;

export function collectRefs(input: {
  address: SymbolAddress;
  engine: Engine;
  read: (file: string) => string;
}): ({ ok: true } & FoundRefs) | { ok: false; refusal: string } {
  const { address, engine } = input;
  const texts = new Map<string, string>();
  const read = (f: string): string => {
    const cached = texts.get(f) ?? input.read(f);
    texts.set(f, cached);
    return cached;
  };
  const file = resolve(engine.root, address.file);
  const located = locateExport(read(file), address);
  if (!located.ok) return located;

  const at = { ...located.at, file };
  const all = findReferences(engine, at);
  const isDeclaration = (r: { file: string; start: number }) =>
    r.file === at.file && r.start === at.start;
  // A file outside every engine project, or in another case, yields nothing, not even itself.
  if (!all.some(isDeclaration)) {
    return {
      ok: false,
      refusal: `Cannot resolve '${address.file}#${address.symbol}': the file is in none of the engine's projects.`,
    };
  }
  const refs = all.filter((r) => !isDeclaration(r));
  const entries = refs.map((ref): RefEntry<SymbolRefKind> => {
    const text = read(ref.file);
    const source = parseTs(ref.file, text);
    const node = findNameNode(source, ref);
    const { line, character } = source.getLineAndCharacterOfPosition(ref.start);
    const filePath = rootRelative(engine.root, ref.file);
    return {
      filePath,
      line: line + 1,
      column: character + 1,
      kind: classifySymbolRef(text, ref),
      inTest: TEST_PATH.test(filePath),
      enclosing: node ? enclosingLabel(source, node) : '<module>',
    };
  });

  const report = {
    target: `${rootRelative(engine.root, file)}#${address.symbol}`,
    refs: entries,
    fileCount: new Set(entries.map((e) => e.filePath)).size,
    testCount: entries.filter((e) => e.inTest).length,
  };
  return { ok: true, report, at, refs };
}
