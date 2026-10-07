import record from '../../../../ATTRIBUTIONS.md?raw';
import { parseAttributions } from '../../../../tools/utils/io/parseAttributions';
import { creditGroups } from '../utils/creditGroups';

/**
 * The repository's licence record, read when the site is built: nothing a
 * rights holder states or asks for is typed a second time on the site. The
 * rows are the parser's; the groups are the file's own sections, for the
 * credits page.
 */
export const ATTRIBUTIONS = parseAttributions(record);
export const CREDIT_GROUPS = creditGroups(record, ATTRIBUTIONS);
