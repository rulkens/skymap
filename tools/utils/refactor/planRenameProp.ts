/**
 * planRenameProp: repo-wide rename of one property of an exported type, as a plan.
 *
 * The declaration is renamed here, as a plain token; each use goes through
 * `propRenameEdit`. Quoted mentions the engine cannot see (`Pick<T, 'key'>`) ride along as
 * findings, so the run writes and then exits 1 for a human to check them.
 */

import type { FoundPropRefs } from '../../@types/refactor/FoundPropRefs';
import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { PropAddress } from '../../@types/refactor/PropAddress';
import { locateProp } from './locateProp';
import { propRenameEdit } from './propRenameEdit';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function planRenameProp(input: {
  address: PropAddress;
  found: FoundPropRefs;
  newName: string;
  read: (file: string) => string;
}): PlanResult {
  const { address, found, newName, read } = input;
  if (!IDENTIFIER.test(newName)) {
    return refuse(`Cannot rename to '${newName}': it is not a valid identifier.`);
  }
  if (newName === address.prop) {
    return refuse(`Cannot rename '${address.prop}': the new name is the same.`);
  }
  if (locateProp(read(found.at.file), { ...address, prop: newName }).ok) {
    return refuse(`Cannot rename to '${newName}': '${address.typeName}' already has that member.`);
  }

  const { at } = found;
  const edits = [
    { file: at.file, start: at.start, end: at.end, text: newName },
    ...found.refs.map((ref) => propRenameEdit(read(ref.at.file), ref, newName)),
  ];
  return {
    ok: true,
    plan: { edits, moves: [], deletes: [], findings: found.unreported },
  };
}

function refuse(message: string): PlanResult {
  return { ok: false, refusals: [message] };
}
