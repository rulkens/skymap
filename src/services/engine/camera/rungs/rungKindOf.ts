/** The one reader of `PoseFrame`'s spelling: the bare string names the world arm;
 *  every other tag is `{ [kind]: value }`, and the value is that rung's identity. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';

export function rungKindOf(frame: PoseFrame): RungKind {
  if (frame === 'absolute') return 'absolute';
  // The key IS the kind, a fact the union type cannot state.
  return Object.keys(frame)[0] as RungKind;
}
