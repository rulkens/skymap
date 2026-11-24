import type { Engine } from '../../@types/refactor/Engine';
import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { Plan } from '../../@types/refactor/Plan';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import { collectPropRefs } from './collectPropRefs';

/**
 * After a rename is folded and the engine synced: do uses of another property named
 * `newName` now answer to this one? A wider type that already has the name (`Shape &
 * { size }`) makes its property and the renamed one a single symbol, so `b.radius * 2 +
 * b.size` becomes `b.size * 2 + b.size` and still type checks. The renamed sites are the
 * old ones moved by the plan's own edits; any other site at the new name is such a use.
 * Returns the refusal lines, none when the rename is clean.
 */
export function renameMergeRefusal(input: {
  engine: Engine;
  read: (file: string) => string; // overlay applied: the folded text
  address: PropAddress;
  newName: string;
  before: FoundPropRefs;
  plan: Plan;
}): readonly string[] {
  const { engine, address, newName, before, plan } = input;
  const label = `'${address.typeName}.${address.prop}' to '${newName}'`;
  const after = collectPropRefs({
    address: { ...address, prop: newName },
    engine,
    read: input.read,
    texts: () => new Map(),
  });
  if (!after.ok) return [`Cannot rename ${label}: afterwards ${after.refusal}`];

  const renamed = new Set(
    before.refs.map(({ at }) => {
      const moved = plan.edits
        .filter((edit) => edit.file === at.file && edit.start < at.start)
        .reduce((sum, edit) => sum + edit.text.length - (edit.end - edit.start), 0);
      return `${at.file}:${at.start + moved}`;
    }),
  );
  const extra = after.found.refs
    .map((ref, i) => ({ ref, row: after.found.report.refs[i]! }))
    .filter(({ ref }) => !renamed.has(`${ref.at.file}:${ref.at.start}`))
    .map(({ row }) => `${row.filePath}:${row.line}:${row.column}`);
  if (extra.length === 0) return [];
  return [
    `Cannot rename ${label}: afterwards ${extra.length} site(s) would also refer to another property named '${newName}': ${extra.join(', ')}`,
  ];
}
