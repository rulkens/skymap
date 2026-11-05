import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-11-03';
// The Counterscale rows were read from its source at the version our counter reported on this date.
const COUNTER_CHECKED = '2026-10-06';
const IN_REPO = 'in the Skymap repository';
const COUNTER_REPO = 'https://github.com/benvinegar/counterscale';
const COUNTER_SOURCE = `${COUNTER_REPO}/blob/v3.4.1`;

/**
 * The Privacy page's claims, spread into FACTS. Each was read from the code
 * that does it, or from the counter's published source, on its `checked` date.
 * A change to what the app or the site requests or stores changes a row here
 * in the same commit.
 */
export const PRIVACY_FACTS: readonly Fact[] = [
  {
    id: 'privacy-counter',
    about: 'app',
    text: 'The app counts visits with Counterscale, an open-source counter we run on our own Cloudflare account. Its script loads from counterscale.rulkens.workers.dev each time you open the app. This website has no counter.',
    source: `${REPO_BLOB}/src/utils/analytics/injectAnalytics.ts`,
    sourceLabel: `where the app loads the counter, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-records',
    about: 'app',
    text: 'One row each time the app opens, its view changes, or you go back or forward. A row holds the app’s address up to the # sign, with only utm_ campaign labels after the ? sign; the linking page’s address up to the ? sign; your browser’s user-agent text, and the browser, version and kind of device read from it; your country, as Cloudflare reports it; whether this is your first visit of the day; and the time. It holds no IP address. What you look at in the app is written after the # sign, so it is not sent.',
    source: `${COUNTER_SOURCE}/packages/server/app/analytics/collect.ts`,
    sourceLabel: 'what the counter records at version 3.4.1, in the Counterscale repository',
    checked: COUNTER_CHECKED,
  },
  {
    id: 'privacy-counter-retention',
    about: 'app',
    text: 'Its database, Cloudflare Workers Analytics Engine, keeps rows for 90 days. Counterscale copies older rows to storage in our Cloudflare account unless that is switched off.',
    source: COUNTER_REPO,
    sourceLabel: 'Counterscale’s documentation',
    checked: COUNTER_CHECKED,
  },
  {
    id: 'privacy-site-storage',
    about: 'app',
    text: 'Nothing: no cookies and no local storage.',
    source: `${REPO_BLOB}/packages/website/src/layouts/Base.astro`,
    sourceLabel: `the page template, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-app-storage',
    about: 'app',
    text: 'Two items in local storage, and no cookies. skymap.splash.seenVersion is written when you close the welcome screen, so it stays closed. skymap.cameraControls.v1 is written when you change the camera controls, so they stay as you set them.',
    source: `${REPO_BLOB}/src/state/persistedValues.ts`,
    sourceLabel: `what the app stores in the browser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-cache',
    about: 'app',
    text: 'To tell your first visit of the day from a later one, your browser caches a reply from the counter that holds today’s date plus a count up to 3. Every visitor with the same count gets the same reply, so it does not single you out.',
    source: `${COUNTER_SOURCE}/packages/server/app/analytics/collect.ts`,
    sourceLabel: 'how the counter recognises a return visit at version 3.4.1, in the Counterscale repository',
    checked: COUNTER_CHECKED,
  },
  {
    id: 'privacy-host',
    about: 'app',
    text: 'Cloudflare serves this website, the app and the counter, and the app’s data files and the home page’s film from its R2 storage at skymap-data.rulkens.com.',
    source: `${REPO_BLOB}/docs/DEPLOY.md`,
    sourceLabel: `how Skymap is deployed, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-host-sees',
    about: 'app',
    text: 'As with any web host, its servers receive your IP address, your browser’s user-agent text and the address of each file you ask for.',
    source: 'https://www.cloudflare.com/privacypolicy/',
    sourceLabel: 'Cloudflare’s privacy policy',
    checked: CHECKED,
  },
  {
    id: 'privacy-thumbnails',
    about: 'app',
    text: 'For a galaxy with no photograph in Skymap, the app fetches a small picture from the Sloan Digital Sky Survey (skyserver.sdss.org) or the CDS in Strasbourg (alasky.cds.unistra.fr). It does so when the galaxy is drawn about 24 pixels across or larger, which can happen as the app opens, and when you pin its card. The request holds the galaxy’s sky coordinates and reaches the archive with your IP address.',
    source: `${REPO_BLOB}/src/layers/galaxyCatalog/disks/textured/subsystems/texturedDiskSubsystem.ts`,
    sourceLabel: `when the app fetches a galaxy’s picture, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    // Printed only while the form is open (CONTACT_ENDPOINT); the form's own note points here.
    id: 'privacy-contact-form',
    about: 'app',
    text: 'When the form on the domes page comes into view, the page loads Cloudflare’s spam check, Turnstile, from challenges.cloudflare.com. Sending the form emails us your name, organisation, email address and message; the server that passes it on stores nothing.',
    source: `${REPO_BLOB}/src/services/worker/handleContact.ts`,
    sourceLabel: `what the contact form sends, ${IN_REPO}`,
    checked: CHECKED,
  },
];
