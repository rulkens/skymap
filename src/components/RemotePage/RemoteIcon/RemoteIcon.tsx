/** RemoteIcon: the remote's one icon frame; a glyph is only its inner paths, in `REMOTE_GLYPHS`. */

import type { ReactNode } from 'react';
import type { RemoteGlyph } from '../../../@types/remote/RemoteGlyph';
import { REMOTE_GLYPHS } from './remoteGlyphs';

export type RemoteIconProps = {
  readonly glyph: RemoteGlyph;
};

function RemoteIcon({ glyph }: RemoteIconProps): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {REMOTE_GLYPHS[glyph]}
      </g>
    </svg>
  );
}

export default RemoteIcon;
