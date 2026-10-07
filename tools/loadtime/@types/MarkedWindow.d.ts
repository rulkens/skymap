import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import type { LoadMilestones } from './LoadMilestones';

/** The page's `window` once measureLoad's init script has run. */
export type MarkedWindow = SkymapWindow & { __loadMarks: LoadMilestones };
