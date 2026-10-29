import type { PageSection } from '../../@types/PageSection';
import { normalizeHeading } from '../../../../../tools/site/utils/normalizeHeading';

/**
 * The section jobs of the page's structure file, by normalised heading. Base writes the sections
 * as JSON into `#skymap-structure` in dev; a page without it (a docs page, a build without the
 * tag) has no section jobs, so an absent or unreadable tag is an empty map and never an error.
 */
export function readStructureJobs(): Map<string, string> {
  const jobs = new Map<string, string>();
  try {
    const json = document.getElementById('skymap-structure')?.textContent;
    const walk = (sections: PageSection[]) =>
      sections.forEach((s) => {
        jobs.set(normalizeHeading(s.heading), s.job);
        walk(s.parts ?? []);
      });
    if (json) walk(JSON.parse(json) as PageSection[]);
  } catch {
    jobs.clear();
  }
  return jobs;
}
