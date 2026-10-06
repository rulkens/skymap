import type { Fact } from '../@types/Fact';
import { REPO_BLOB } from './siteIdentity';

const CHECKED = '2026-10-06';
const IN_REPO = 'in the skymap repository';
const COUNTER_REPO = 'https://github.com/benvinegar/counterscale';
// The version our counter's own page reported on the check date: the rows below were read from that tag.
const COUNTER_SOURCE = `${COUNTER_REPO}/blob/v3.4.1`;

/**
 * The Privacy page's claims, spread into FACTS. Each was read from the code
 * that does it, or from the counter's published source and its live replies,
 * on the date in `CHECKED`. A change to what the app or the site requests or
 * stores changes a row here in the same commit.
 */
export const PRIVACY_FACTS: readonly Fact[] = [
  {
    id: 'privacy-site-requests',
    about: 'app',
    text: 'The pages of this website load their text, pictures, typefaces and scripts from skymap’s own two addresses, skymap.rulkens.com and skymap-data.rulkens.com, and from nowhere else. They set no cookies, run no visit counter and keep nothing in your browser.',
    source: `${REPO_BLOB}/packages/website/src/layouts/Base.astro`,
    sourceLabel: `the page template, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-host',
    about: 'app',
    text: 'The website and the app are served by Cloudflare. The app’s data files and the film on the home page come from Cloudflare’s R2 storage at skymap-data.rulkens.com.',
    source: `${REPO_BLOB}/wrangler.toml`,
    sourceLabel: `the hosting configuration, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-host-sees',
    about: 'app',
    text: 'As with any web host, Cloudflare’s servers receive your IP address, your browser’s user-agent text and the address of each file you ask for. What Cloudflare does with them is set out in its privacy policy.',
    source: 'https://www.cloudflare.com/privacypolicy/',
    sourceLabel: 'Cloudflare’s privacy policy',
    checked: CHECKED,
  },
  {
    id: 'privacy-counter',
    about: 'app',
    text: 'The app counts visits with Counterscale, an open-source counter that we run ourselves on Cloudflare. Its script loads from counterscale.rulkens.workers.dev each time the app starts, even in a browser that cannot run the app.',
    source: `${REPO_BLOB}/src/utils/analytics/injectAnalytics.ts`,
    sourceLabel: `where the app loads the counter, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-sends',
    about: 'app',
    text: 'Our counter runs Counterscale 3.4.1. Its script reports when the app starts, again each time the app adds an entry to your browser’s history, as it does when the view named in the address changes, and when you go back or forward. Each report carries the counter’s name for the site (skymap), the app’s host name, the path of its address and a count of 1, 2 or 3 (see “No cookie”). Nothing after a # sign is sent, and what you look at in the app is written after the # sign. From the part after a question mark the script sends only the campaign labels a link may carry: utm_source, utm_medium, utm_campaign, utm_term and utm_content. It sends the address of the page that linked you, cut at the question mark. When your browser names no such page, it sends the value of ref, referer, referrer, source or utm_source from the app’s address instead.',
    source: `${COUNTER_SOURCE}/packages/tracker/src/lib/track.ts`,
    sourceLabel: 'the counter’s script at version 3.4.1, in the Counterscale repository',
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-stores',
    about: 'app',
    text: 'For each report the counter stores what the script sent: the site’s name, the host name, the path, the referring address and the five campaign labels. It also stores your browser’s user-agent text; the browser’s name, its major version, and the model and kind of device, all worked out from that text; the country Cloudflare’s network reports for the request; and two numbers that say whether the report is your browser’s first of the day, its second or a later one. Each stored row also has the time of the report, which the database adds. The counter does not store your IP address.',
    source: `${COUNTER_SOURCE}/packages/server/app/analytics/collect.ts`,
    sourceLabel: 'what the counter records at version 3.4.1, in the Counterscale repository',
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-cache',
    about: 'app',
    text: 'The counter sets no cookie. To tell a first visit of the day from a later one, the script asks the counter’s /cache address before each report. The reply carries a date that your browser keeps in its cache and sends back the next time. The date is midnight of the current day plus a count of up to 3. It is the same for every visitor with that count, so it does not single you out.',
    source: `${COUNTER_SOURCE}/packages/server/app/analytics/collect.ts`,
    sourceLabel: 'how the counter recognises a return visit at version 3.4.1, in the Counterscale repository',
    checked: CHECKED,
  },
  {
    id: 'privacy-counter-retention',
    about: 'app',
    text: 'Counterscale’s documentation says that its database, Cloudflare Workers Analytics Engine, keeps 90 days of rows, and that older rows are copied to storage in the operator’s own Cloudflare account unless that is switched off.',
    source: COUNTER_REPO,
    sourceLabel: 'Counterscale’s documentation',
    checked: CHECKED,
  },
  {
    id: 'privacy-no-notice',
    about: 'app',
    text: 'The app shows no notice about the counter and has no switch to turn it off.',
    source: `${REPO_BLOB}/src/main.tsx`,
    sourceLabel: `the app’s start-up code, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-app-storage',
    about: 'app',
    text: 'The app keeps one item in your browser’s local storage, named skymap.splash.seenVersion. It holds the number of the welcome screen you closed, so that the screen stays closed on your next visit. The app sets no cookies and has no accounts.',
    source: `${REPO_BLOB}/src/state/persistedValues.ts`,
    sourceLabel: `what the app stores in the browser, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-thumbnails',
    about: 'app',
    text: 'For a galaxy without a photograph of its own in skymap, the app asks an astronomy archive for a small picture of that patch of sky when the camera comes close or when you open the galaxy’s card: first the Sloan Digital Sky Survey’s SkyServer, then the CDS in Strasbourg. The request carries the sky coordinates and, as every request does, your IP address.',
    source: `${REPO_BLOB}/src/utils/network/fetchGalaxyBitmap.ts`,
    sourceLabel: `where the app fetches galaxy pictures, ${IN_REPO}`,
    checked: CHECKED,
  },
  {
    id: 'privacy-form-closed',
    about: 'app',
    text: 'There is no contact form on this website today. The form is built, but it is left out of the page until its mailbox is connected, so nothing you type here can reach us or anyone else.',
    source: `${REPO_BLOB}/packages/website/src/data/contact.ts`,
    sourceLabel: `the contact setting, ${IN_REPO}`,
    checked: CHECKED,
  },
];
