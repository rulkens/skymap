/**
 * SAMPLED_BODY_IDS — the ids of `SAMPLED_BODIES`, in order: the craft the
 * missions Layer captions. An array, not a Set, because a Layer's label entry
 * declares its claimed bodies as a list; readers `.includes` its two ids.
 */

import { SAMPLED_BODIES } from './spacecraftBodies';

export const SAMPLED_BODY_IDS: readonly string[] = SAMPLED_BODIES.map((body) => body.id);
