/** The frame's debug/log grammar; the kind prefix exists so a body id 'absolute' can't collide with the world arm. */
import type { PoseFrame } from '../../../../@types/camera/PoseFrame';
import type { RungKind } from '../../../../@types/camera/RungKind';
import { rungKindOf } from './rungKindOf';

export function frameKey(frame: PoseFrame): string {
  const kind = rungKindOf(frame);
  if (frame === 'absolute') return kind;
  // The kind IS the key the tag carries its id under (§2.1), so one index
  // spells every rung and a new one needs no line here; the index is what the
  // union type cannot state.
  return `${kind}:${(frame as Record<RungKind, string>)[kind]}`;
}
