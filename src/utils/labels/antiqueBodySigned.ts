import { ANTIQUE_LABEL_RULES } from '../../data/labels/antiqueLabelRules';

/**
 * Whether the antique look names this body, and so prints a sign for it below a globe.
 * The plate's sign list (`antiqueBodySigns`) and the director's "no name without its
 * owner" rule both read the label rule's `names`, so a name and its sign cannot part.
 */
export function antiqueBodySigned(bodyId: string): boolean {
  return `sceneBody-${bodyId}` in (ANTIQUE_LABEL_RULES.body?.names ?? {});
}
