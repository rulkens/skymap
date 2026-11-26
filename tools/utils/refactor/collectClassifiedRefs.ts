/**
 * collectClassifiedRefs: the engine's references to the symbol at `at`, each classified
 * and labelled with its enclosing declaration: the one pass `collectRefs` and
 * `collectPropRefs` share, differing only in the classifier. The declaration itself is
 * dropped from `refs`. `tests/` is a flag (`inTest`), not a kind.
 */

import type { Engine } from '../../@types/refactor/Engine';
import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { RefEntry } from '../../@types/refactor/RefEntry';
import type { RefReport } from '../../@types/refactor/RefReport';
import type { RelatedDeclaration } from '../../@types/refactor/RelatedDeclaration';
import { enclosingLabel } from './enclosingLabel';
import { findReferencedSymbols } from './engine/findReferencedSymbols';
import { findNameNode } from './findNameNode';
import { parseTs } from './parseTs';
import { rootRelative } from './rootRelative';

const TEST_PATH = /^(packages\/[^/]+\/)?tests\//;

export function collectClassifiedRefs<Kind extends string>(input: {
  engine: Engine;
  at: NodeLocation;
  label: string; // the address as typed, for the refusal
  target: string; // root-relative, for the report
  read: (file: string) => string;
  classify: (text: string, ref: NodeLocation) => Kind;
}):
  | {
      ok: true;
      refs: readonly { at: NodeLocation; kind: Kind }[];
      report: RefReport<Kind>;
      related: readonly RelatedDeclaration[];
    }
  | { ok: false; refusal: string } {
  const { engine, at, read } = input;
  const { references, related } = findReferencedSymbols(engine, at);
  const isDeclaration = (r: NodeLocation) => r.file === at.file && r.start === at.start;
  // A file outside every engine project, or in another case, yields nothing, not even itself.
  if (!references.some(isDeclaration)) {
    return {
      ok: false,
      refusal: `Cannot resolve '${input.label}': the file is in none of the engine's projects.`,
    };
  }
  const refs = references
    .filter((r) => !isDeclaration(r))
    .map((ref) => ({ at: ref, kind: input.classify(read(ref.file), ref) }));
  const entries = refs.map(({ at: ref, kind }): RefEntry<Kind> => {
    const source = parseTs(ref.file, read(ref.file));
    const node = findNameNode(source, ref);
    const { line, character } = source.getLineAndCharacterOfPosition(ref.start);
    const filePath = rootRelative(engine.root, ref.file);
    return {
      filePath,
      line: line + 1,
      column: character + 1,
      kind,
      inTest: TEST_PATH.test(filePath),
      enclosing: node ? enclosingLabel(source, node) : '<module>',
    };
  });
  const report = {
    target: input.target,
    refs: entries,
    fileCount: new Set(entries.map((e) => e.filePath)).size,
    testCount: entries.filter((e) => e.inTest).length,
  };
  return { ok: true, refs, report, related };
}
