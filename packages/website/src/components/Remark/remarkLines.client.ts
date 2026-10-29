// Makes every live Remark on the page live: imported by layouts/Base.astro's script, once per page.
import { domeTurnLine } from '../../utils/domeTurnLine.ts';
import { filesFetchedLine } from '../../utils/filesFetchedLine.ts';
import { liveLine } from '../../utils/liveLine.ts';
import type { RemarkProps } from './Remark.tsx';

const SAY: Record<NonNullable<RemarkProps['live']>, () => string> = {
  'dome-turn': () => domeTurnLine(performance.now() / 1000),
  // The page itself and everything it asked for, as the browser's own timing list has them.
  'files-fetched': () =>
    filesFetchedLine(
      [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
        .map((entry) => entry.name)
        .filter((name) => name.startsWith('http')),
    ),
};

for (const line of document.querySelectorAll<HTMLElement>('[data-remark]')) {
  liveLine(line, SAY[line.dataset.remark as keyof typeof SAY]);
}
