/**
 * collectPropRefs: every reference to a property of an exported type, classified, plus
 * the quoted mentions the engine cannot see.
 *
 * Asking the engine at the property's name token returns the declaration, `a.radius`,
 * object-literal keys (also through `Pick`/`Partial`), shorthands, destructures,
 * `a['radius']`, `Shape['radius']` and JSX attributes. The declaration is `at`, not a ref.
 * A type that re-declares the member of an interface it extends (or of a library base)
 * shares the symbol's references with it: that is refused, since an edit would reach the
 * other declaration's uses too.
 */

import { resolve } from 'node:path';
import type { Engine } from '../../@types/refactor/Engine';
import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import { classifyPropUse } from './classifyPropUse';
import { collectClassifiedRefs } from './collectClassifiedRefs';
import { findQuotedMentions } from './findQuotedMentions';
import { locateProp } from './locateProp';
import { rootRelative } from './rootRelative';

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
  const collected = collectClassifiedRefs({
    engine,
    at,
    label: `${address.file}#${address.typeName}.${address.prop}`,
    target: `${rootRelative(engine.root, file)}#${address.typeName}.${address.prop}`,
    read,
    classify: classifyPropUse,
  });
  if (!collected.ok) return collected;
  const { refs, report, related } = collected;

  const linked = related.find((declaration) => declaration.typeMember);
  if (linked) {
    return {
      ok: false,
      refusal:
        `Cannot change '${address.typeName}.${address.prop}': it is linked to ` +
        `'${linked.owner}.${address.prop}' (${rootRelative(engine.root, linked.file)}:${linked.line}). ` +
        `One type re-declares the other's member, so the engine treats them as one property; change both by hand.`,
    };
  }

  const unreported = findQuotedMentions({
    typeName: address.typeName,
    prop: address.prop,
    texts: input.texts(),
    known: [at, ...refs.map((r) => r.at)],
  }).map((finding) => ({ ...finding, file: rootRelative(engine.root, finding.file) }));
  return { ok: true, found: { report, at, refs, unreported } };
}
