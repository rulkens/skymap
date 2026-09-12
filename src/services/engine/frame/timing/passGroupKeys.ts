/**
 * PASS_GROUP_KEYS — layer name → groupKey, so a consumer holding only PLAIN
 * names (the RenderTogglesSection, fed the engine handle's live togglable-pass
 * list) can project them into the same groups the timing list uses.
 */

import { MAX_PROGRAM } from './maxProgram';
import { plainPassGroupKeys } from './plainPassGroupKeys';

export const PASS_GROUP_KEYS: ReadonlyMap<string, string> = plainPassGroupKeys(MAX_PROGRAM);
