/**
 * TARGET_IDENTITY_KEY — a type-prefixed identity per FocusableTarget kind: two targets
 * are the same thing iff their keys are equal. The empty-string fallback is unreachable
 * because the table is only indexed by the target's own tag.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import type { FocusableTargetType } from '../../../@types/engine/FocusableTargetType';

export const TARGET_IDENTITY_KEY: Record<FocusableTargetType, (t: FocusableTarget) => string> = {
  galaxyCatalog: (t) => (t.type === 'galaxyCatalog' ? `galaxyCatalog:${t.source}:${t.index}` : ''),
  structure: (t) => (t.type === 'structure' ? `structure:${t.id}` : ''),
  milkyWay: () => 'milkyWay',
  zoneOfAvoidance: () => 'zoneOfAvoidance',
  // Seed ids are unique across every scene body, so craft and earthScene share the body key shape.
  body: (t) => (t.type === 'body' ? `body:${t.id}` : ''),
  craft: (t) => (t.type === 'craft' ? `body:${t.id}` : ''),
  earthScene: (t) => (t.type === 'earthScene' ? `body:${t.id}` : ''),
  // The two seeded tables and the survey bin number independently, so source is part of the key.
  starCatalog: (t) => (t.type === 'starCatalog' ? `starCatalog:${t.source}:${t.index}` : ''),
  blackHole: (t) => (t.type === 'blackHole' ? `blackHole:${t.id}` : ''),
  satellite: (t) => (t.type === 'satellite' ? `satellite:${t.noradId}` : ''),
};
