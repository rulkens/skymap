import { fitText } from './fitText';
import { plainText } from './plainText';

/** As long as a licence line may run in a list of many sources. */
const LEAD_MAX = 120;

/**
 * The short form of a source's licence for a list: the opening of its
 * `Licence` bullet in `ATTRIBUTIONS.md`, to the end of the first sentence that
 * says something. A lead-in that ends in a colon ("The viewer states:") runs
 * on into what it introduces. Nothing is classified or reworded here, so the
 * short form cannot say more or less than the record does; the full line is on
 * the source's own page.
 */
export function licenceLead(licence: string): string {
  const text = plainText(licence);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char !== '.' || depth > 0) continue;
    // A sentence may close its quotation or bracket after the full stop.
    const end = /^\.["”)]*(\s|$)/.exec(text.slice(i));
    if (!end) continue;
    const lead = text.slice(0, i + end[0].trimEnd().length);
    const open = (lead.match(/"/g)?.length ?? 0) % 2 === 1;
    return fitText(open ? `${lead.slice(0, -1)} …"` : lead, LEAD_MAX);
  }
  return fitText(text, LEAD_MAX);
}
