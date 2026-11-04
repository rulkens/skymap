/** The repo's companion-file rules, read once from `move-files.config.json`. */

import config from '../../../move-files.config.json';
import type { CompanionRule } from '../../../packages/move-files/src/@types/CompanionRule';

export const companionRules: ReadonlyArray<CompanionRule> = config.rules;
