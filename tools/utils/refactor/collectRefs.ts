/**
 * collectRefs: every reference to an exported symbol, classified, as the report
 * `refs` prints and every other subcommand previews.
 *
 * The engine answers "where"; the TypeScript 6 parser answers "what kind" and "inside
 * what", per reference (see `collectClassifiedRefs`). The declaration itself is dropped
 * from `refs` and returned as `at`.
 */

import { resolve } from 'node:path';
import type { Engine } from '../../@types/refactor/Engine';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import { classifySymbolRef } from './classifySymbolRef';
import { collectClassifiedRefs } from './collectClassifiedRefs';
import { locateExport } from './locateExport';
import { rootRelative } from './rootRelative';

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
  const found = collectClassifiedRefs({
    engine,
    at,
    label: `${address.file}#${address.symbol}`,
    target: `${rootRelative(engine.root, file)}#${address.symbol}`,
    read,
    classify: classifySymbolRef,
  });
  if (!found.ok) return found;
  return { ok: true, report: found.report, at, refs: found.refs.map((r) => r.at) };
}
