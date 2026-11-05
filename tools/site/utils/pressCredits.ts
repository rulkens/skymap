import type { PressKitPlan } from '../@types/PressKitPlan';
import type { PressPicture } from '../../../packages/website/src/@types/PressPicture';
import { appLink } from '../../../packages/website/src/data/appLink';
import { CONTACT_EMAIL } from '../../../packages/website/src/data/contact';
import { fact } from '../../../packages/website/src/data/fact';
import { SITE_ORIGIN } from '../../../packages/website/src/data/site';
import { siteShot } from '../../../packages/website/src/data/siteShot';
import { pressPicturePath } from './pressPicturePath';

/**
 * The press kit's `credits.txt`: the terms every picture shares, then for each file what it shows, what is
 * data and what is drawn (the shot manifest's words), the credit to print and its sources' terms
 * (data/pressPictures.ts), and the address of the same view in the app.
 */
export function pressCredits(
  pictures: readonly PressPicture[],
  plan: Pick<PressKitPlan, 'filmFile' | 'filmCredit' | 'portraitFile' | 'portraitCredit'>,
): string {
  const terms = ['about-picture-licence', 'about-picture-reuse', 'gaia-licence'].map(
    (id) => fact(id).text,
  );
  const blocks = pictures.map((row) => {
    const shot = siteShot(row.shot);
    return [
      pressPicturePath(row),
      `  ${row.title}`,
      `  Shows: ${[shot.title, shot.caption].filter(Boolean).join('. ')}`,
      ...(shot.drawn ? [`  Data and drawing: ${shot.drawn}`] : []),
      `  Credit to print: ${row.credit}.`,
      `  Terms: ${row.terms}`,
      `  The same view in the app: ${new URL(appLink(shot.link, shot.query), SITE_ORIGIN).href}`,
    ].join('\n');
  });
  return [
    'Skymap press kit: credits and terms',
    '',
    terms.join(' '),
    `Write to ${CONTACT_EMAIL} before you reuse a picture or the film.`,
    '',
    ...blocks.flatMap((block) => [block, '']),
    plan.filmFile,
    '  A cut of the flight on the Skymap website, recorded from the app.',
    `  Credit to print: ${plan.filmCredit}.`,
    '',
    plan.portraitFile,
    `  Credit to print: ${plan.portraitCredit}.`,
    '',
    'logo/ and icon/',
    '  The Skymap wordmark and app icon. The word is set in Cormorant Garamond by Christian Thalmann of Catharsis Fonts (SIL Open Font Licence 1.1).',
    '',
  ].join('\n');
}
