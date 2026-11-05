/** SAMPLED_BODY_IDS — the craft whose position is a loaded track, so whose presence waits on it. */

import { SAMPLED_BODIES } from './sampledBodies';

export const SAMPLED_BODY_IDS: readonly string[] = SAMPLED_BODIES.map((body) => body.id);
