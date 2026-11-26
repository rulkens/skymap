/** A block's direct children in order, consecutive children of one Name and icon folded into one member. */
import { rowFace } from './rowFace';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { RowMember } from '../../@types/rows/RowMember';

export function groupMembers(children: readonly Effect[]): RowMember[] {
  const members: RowMember[] = [];
  for (const child of children) {
    // Every effect kind is a row kind; the compiler cannot pair a union kind with its own subject.
    const { glyph, family, label } = rowFace(child.kind, child as never);
    const last = members.at(-1);
    if (last?.glyph === glyph && last.name === label.name && last.family === family) {
      members[members.length - 1] = { ...last, count: last.count + 1 };
    } else {
      members.push({ glyph, family, name: label.name, count: 1 });
    }
  }
  return members;
}
