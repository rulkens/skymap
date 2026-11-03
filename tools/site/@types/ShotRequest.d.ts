import type { SiteShotSettings } from '../../../packages/website/src/@types/SiteShotSettings';

/**
 * A page designer's request for a picture, one JSON file in the shot-request queue
 * (`npm run site:requests`). `shotId` is the manifest row to reshoot, or `'new'`; `link`,
 * `settings` and `size` are a framing the requester already tried with `site:shots --try`.
 * Whoever runs the shoot sets `status`, `answer` and, when done, the `resultIds` to use.
 */
export type ShotRequest = {
  requester: string;
  page: string;
  section: string;
  shotId: string;
  subject: string;
  link?: string;
  settings?: SiteShotSettings;
  size?: { width: number; height: number };
  why: string;
  status: 'open' | 'done' | 'declined';
  answer?: string;
  resultIds?: string[];
};
