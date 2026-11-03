/**
 * REMOTE_GLYPHS: the inner paths of each remote glyph, drawn on a 24-unit grid inside
 * `RemoteIcon`'s stroke frame.
 */

import type { ReactNode } from 'react';
import type { RemoteGlyph } from '../../../@types/remote/RemoteGlyph';

export const REMOTE_GLYPHS: Record<RemoteGlyph, ReactNode> = {
  home: <path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" />,
  skymap: (
    <path d="M12 3c.8 5.2 3.8 8.2 9 9-5.2.8-8.2 3.8-9 9-.8-5.2-3.8-8.2-9-9 5.2-.8 8.2-3.8 9-9z" />
  ),
  openspace: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M20.2 8.6c1.2 1.4 1.3 2.5.6 3.2-1.6 1.6-6.3.9-10.4-1.6M3.8 15.4c-1.2-1.4-1.3-2.5-.6-3.2 1-1 3.2-1.2 5.6-.6" />
    </>
  ),
  orbit: (
    <>
      <path d="M19 12a7 7 0 1 1-2.1-5M19 4v3.5h-3.5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  look: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  roll: (
    <>
      <path d="M5 12h14" />
      <path d="M20 8.5A8.5 8.5 0 0 0 5.5 6M4 15.5A8.5 8.5 0 0 0 18.5 18" />
      <path d="M5.5 2.5V6H9M18.5 21.5V18H15" />
    </>
  ),
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20.5 20.5" />
    </>
  ),
  tour: (
    <>
      <circle cx="5.5" cy="18" r="2" />
      <circle cx="18.5" cy="6" r="2" />
      <path d="M7.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8.5" />
    </>
  ),
  exhibit: (
    <>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 8.5c.35 2.1 1.4 3.15 3.5 3.5-2.1.35-3.15 1.4-3.5 3.5-.35-2.1-1.4-3.15-3.5-3.5 2.1-.35 3.15-1.4 3.5-3.5z" />
    </>
  ),
  clip: (
    <path d="M3.5 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2zM15.5 10.5l5-3v9l-5-3z" />
  ),
  stop: <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 8l-4 4 4 4M6 12h9" />,
  time: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  labels: (
    <>
      <path d="M3.5 12.5v-7a2 2 0 0 1 2-2h7l8 8a1.6 1.6 0 0 1 0 2.3l-6.7 6.7a1.6 1.6 0 0 1-2.3 0z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  setup: (
    <>
      <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  phone: (
    <path d="M14.5 13v5.5a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H10M8.5 17.5h2M18 3.5v7M14.5 7h7" />
  ),
  play: (
    <g fill="currentColor">
      <path d="M8 5.5v13l10.5-6.5z" />
    </g>
  ),
  pause: (
    <g fill="currentColor">
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </g>
  ),
  prev: (
    <>
      <path d="M6.5 5.5v13" />
      <g fill="currentColor">
        <path d="M18.5 5.8v12.4L9.5 12z" />
      </g>
    </>
  ),
  next: (
    <>
      <path d="M17.5 5.5v13" />
      <g fill="currentColor">
        <path d="M5.5 5.8v12.4L14.5 12z" />
      </g>
    </>
  ),
  backward: <path d="M19 12H5M11 6l-6 6 6 6" />,
  forward: <path d="M5 12h14M13 6l6 6-6 6" />,
  slower: <path d="M6 12h12" />,
  faster: <path d="M12 6v12M6 12h12" />,
  live: (
    <>
      <g fill="currentColor">
        <circle cx="12" cy="12" r="2.25" />
      </g>
      <path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </>
  ),
  calendar: (
    <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8.5 3v4M15.5 3v4" />
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  redLight: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />,
};
