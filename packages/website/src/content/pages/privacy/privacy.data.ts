import { fact } from '../../../data/fact';
import { formatDate } from '../../../utils/formatDate';

export const SITE = [
  { term: 'What it loads', id: 'privacy-site-requests' },
  { term: 'Who serves it', id: 'privacy-host' },
  { term: 'What the host sees', id: 'privacy-host-sees' },
];
export const COUNTER = [
  { term: 'The counter', id: 'privacy-counter' },
  { term: 'What it sends', id: 'privacy-counter-sends' },
  { term: 'What is stored', id: 'privacy-counter-stores' },
  { term: 'No cookie', id: 'privacy-counter-cache' },
  { term: 'How long', id: 'privacy-counter-retention' },
  { term: 'No notice', id: 'privacy-no-notice' },
];
export const APP = [
  { term: 'In your browser', id: 'privacy-app-storage' },
  { term: 'Galaxy pictures', id: 'privacy-thumbnails' },
];
// Every fact row the page prints is in factIds, so the Sources list cannot drift from the copy.
export const factIds = [...SITE, ...COUNTER, ...APP].map((item) => item.id);
export const checked = formatDate(fact('privacy-site-requests').checked);
