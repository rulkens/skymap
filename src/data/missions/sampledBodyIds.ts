/** SAMPLED_BODY_IDS — an array, not a Set: a Layer's label entry claims bodies as a list. */

import { SAMPLED_BODIES } from './spacecraftBodies';

export const SAMPLED_BODY_IDS: readonly string[] = SAMPLED_BODIES.map((body) => body.id);
