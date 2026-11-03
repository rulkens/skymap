/**
 * TARGET_NAME — the name a FocusableTarget's info card headlines, per kind: the sibling of
 * TARGET_IDENTITY_KEY, with the same unreachable empty-string fallback. A galaxy's
 * `displayName` is already the card's name ladder (famous name first).
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../../@types/engine/FocusableTargetType';

export const TARGET_NAME: Record<FocusableTargetType, (t: FocusableTarget) => string> = {
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? t.displayName : ''),
  structure: (t) => (t.type === 'structure' ? t.name : ''),
  milkyWay: (t) => (t.type === 'milkyWay' ? t.displayName : ''),
  zoneOfAvoidance: (t) => (t.type === 'zoneOfAvoidance' ? t.displayName : ''),
  body: (t) => (t.type === 'body' ? t.label : ''),
  craft: (t) => (t.type === 'craft' ? t.label : ''),
  earthScene: (t) => (t.type === 'earthScene' ? t.label : ''),
  starCatalog: (t) => (t.type === 'starCatalog' ? t.displayName : ''),
  blackHole: (t) => (t.type === 'blackHole' ? t.label : ''),
  satellite: (t) => (t.type === 'satellite' ? t.label : ''),
};
