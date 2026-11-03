/** REMOTE_GLYPHS: the inner paths of each remote glyph, drawn on a 24-unit grid inside `RemoteIcon`'s stroke frame. */

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
};
