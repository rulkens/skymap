import type { FocusId } from '../../@types/animation/FocusId';

/**
 * Brand a raw string as a FocusId.
 *
 * The brand is a TypeScript-only assertion: at runtime, the value is still
 * just the string. Callers use this at the authoring boundary to stamp
 * validated identifiers before passing them into the tour/clip graph.
 */
export function focusId(raw: string): FocusId {
  return raw as FocusId;
}
