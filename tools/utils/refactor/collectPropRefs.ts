/**
 * collectPropRefs: every reference to a property of an exported type, classified, plus
 * the quoted mentions the engine cannot see.
 *
 * Asking the engine at the property's name token returns the declaration, `a.radius`,
 * object-literal keys (also through `Pick`/`Partial`), shorthands, destructures,
 * `a['radius']`, `Shape['radius']` and JSX attributes. The declaration is `at`, not a ref.
 */

import { resolve } from 'node:path';
import type { Engine } from '../../@types/refactor/Engine';
import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import type { PropUseKind } from '../../@types/refactor/PropUseKind';
import type { RefEntry } from '../../@types/refactor/RefEntry';
import { classifyPropUse } from './classifyPropUse';
import { enclosingLabel } from './enclosingLabel';
import { findReferences } from './engine/findReferences';
import { findNameNode } from './findNameNode';
import { findQuotedMentions } from './findQuotedMentions';
import { locateProp } from './locateProp';
import { parseTs } from './parseTs';
import { rootRelative } from './rootRelative';

const TEST_PATH = /^(packages\/[^/]+\/)?tests\//;

export function collectPropRefs(input: {
  address: PropAddress;
  engine: Engine;
  read: (file: string) => string;
  texts: () => ReadonlyMap<string, string>; // every project file, for the quoted-mention search
}): { ok: true; found: FoundPropRefs } | { ok: false; refusal: string } {
  const { address, engine, read } = input;
  const file = resolve(engine.root, address.file);
  const located = locateProp(read(file), address);
  if (!located.ok) return located;

  const at = { ...located.at, file };
  const all = findReferences(engine, at);
  const isDeclaration = (r: { file: string; start: number }) =>
    r.file === at.file && r.start === at.start;
  // A file outside every engine project, or in another case, yields nothing, not even itself.
  if (!all.some(isDeclaration)) {
    return {
      ok: false,
      refusal: `Cannot resolve '${address.file}#${address.typeName}.${address.prop}': the file is in none of the engine's projects.`,
    };
  }
  const refs = all
    .filter((r) => !isDeclaration(r))
    .map((ref) => ({ at: ref, kind: classifyPropUse(read(ref.file), ref) }));
  const entries = refs.map(({ at: ref, kind }): RefEntry<PropUseKind> => {
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

  const unreported = findQuotedMentions({
    typeName: address.typeName,
    prop: address.prop,
    texts: input.texts(),
    known: [at, ...refs.map((r) => r.at)],
  }).map((finding) => ({ ...finding, file: rootRelative(engine.root, finding.file) }));
  const report = {
    target: `${rootRelative(engine.root, file)}#${address.typeName}.${address.prop}`,
    refs: entries,
    fileCount: new Set(entries.map((e) => e.filePath)).size,
    testCount: entries.filter((e) => e.inTest).length,
  };
  return { ok: true, found: { report, at, refs, unreported } };
}
