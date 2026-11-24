import type { NodeLocation } from '../../@types/refactor/NodeLocation';
import type { PropUseKind } from '../../@types/refactor/PropUseKind';
import type { TextEdit } from '../../@types/refactor/TextEdit';

/**
 * The edit that renames one reference to a property. A shorthand `{ radius }` names a
 * local as well as the property, and the engine does not report the local's later uses,
 * so the key is renamed and the local kept: `{ size: radius }` builds or reads the same
 * value. Every other kind replaces the name token; a string key keeps its quotes because
 * `at` is the span inside them.
 */
export function propRenameEdit(
  text: string,
  ref: { at: NodeLocation; kind: PropUseKind },
  newName: string,
): TextEdit {
  const { at, kind } = ref;
  const shorthand = kind === 'shorthand-write' || kind === 'shorthand-destructure';
  const replacement = shorthand ? `${newName}: ${text.slice(at.start, at.end)}` : newName;
  return { file: at.file, start: at.start, end: at.end, text: replacement };
}
