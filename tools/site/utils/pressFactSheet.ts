import type { PressKitPlan } from '../@types/PressKitPlan';
import { appLink } from '../../../packages/website/src/data/appLink';
import { CONTACT_EMAIL } from '../../../packages/website/src/data/contact';
import { DATA_SOURCES } from '../../../packages/website/src/data/dataSources';
import { fact } from '../../../packages/website/src/data/fact';
import { BASE, SITE_ORIGIN } from '../../../packages/website/src/data/site';
import { MAKER_NAME, MAKER_SITE, REPO_URL } from '../../../packages/website/src/data/siteIdentity';
import { pressDescription } from './pressDescription';

/**
 * The press kit's `fact-sheet.md`: the two descriptions, then facts and addresses read from the site's own
 * registries, so the sheet states nothing the site does not and follows it when a row changes.
 */
export function pressFactSheet(plan: Pick<PressKitPlan, 'short' | 'long'>): string {
  const groups = [...new Set(DATA_SOURCES.map((source) => source.group))];
  const facts = [
    { fact: 'about-licence' },
    { fact: 'about-what-is', sentences: [3] },
    { fact: 'about-maker' },
  ];
  const checked = [...plan.short, ...plan.long, ...facts].map((pick) => fact(pick.fact));
  const lines = [
    '# Skymap: fact sheet',
    '',
    '## In 50 words',
    '',
    pressDescription(plan.short),
    '',
    '## In 150 words',
    '',
    pressDescription(plan.long),
    '',
    '## Facts',
    '',
    ...facts.map((pick) => `- ${pressDescription([pick])}`),
    '',
    '## Where its data come from',
    '',
    ...groups.map(
      (group) =>
        `- ${group}: ${DATA_SOURCES.filter((source) => source.group === group)
          .map((source) => source.name)
          .join('; ')}`,
    ),
    '',
    '## Addresses',
    '',
    `- Website: ${new URL(BASE, SITE_ORIGIN).href}`,
    `- The app: ${new URL(appLink(), SITE_ORIGIN).href}`,
    `- Source code: ${REPO_URL}`,
    `- ${MAKER_NAME}: ${MAKER_SITE}`,
    '',
    '## Contact',
    '',
    `${MAKER_NAME}, ${CONTACT_EMAIL}`,
    '',
    '## Where these facts are checked',
    '',
    ...new Set(checked.map((row) => `- ${row.sourceLabel}: ${row.source}`)),
    '',
  ];
  return lines.join('\n');
}
