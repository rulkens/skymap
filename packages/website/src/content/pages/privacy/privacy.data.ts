import { fact } from '../../../data/fact';
import { CONTACT_ENDPOINT } from '../../../data/contact';
import { formatDate } from '../../../utils/formatDate';

export const COLLECTED = [
  { term: 'Visit counter', id: 'privacy-counter' },
  { term: 'What it records', id: 'privacy-counter-records' },
  { term: 'How long', id: 'privacy-counter-retention' },
];
export const IN_BROWSER = [
  { term: 'This website', id: 'privacy-site-storage' },
  { term: 'The app', id: 'privacy-app-storage' },
  { term: 'The counter', id: 'privacy-counter-cache' },
];
export const OTHERS = [
  { term: 'Cloudflare', id: 'privacy-host' },
  { term: 'What Cloudflare sees', id: 'privacy-host-sees' },
  { term: 'Galaxy pictures', id: 'privacy-thumbnails' },
  ...(CONTACT_ENDPOINT ? [{ term: 'Contact form', id: 'privacy-contact-form' }] : []),
];
// Every fact row the page prints is in factIds, so the Sources list cannot drift from the copy.
export const factIds = [...COLLECTED, ...IN_BROWSER, ...OTHERS].map((item) => item.id);
export const checked = formatDate(factIds.map((id) => fact(id).checked).sort().at(-1)!);
