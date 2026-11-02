/*
 * DocFigure — `<Figure id="…" />` on a docs page: a picture from the shot
 * manifest with its label and "Open this view", in the docs' FigureFrame. A
 * picture of the app's interface is a wide figure, so its text can be read
 * (utils/docFigureWide.ts). A phone gets the manifest's `<id>-phone` row
 * where there is one. `eager` is for the one picture a page opens on, before
 * its first heading. `wide` sets a picture of the scene alone as wide as the
 * interface shots beside it.
 */
import type { FigureFrameSheet } from '../../../@types/FigureFrameSheet';
import { siteShot } from '../../../data/siteShot.ts';
import { SITE_SHOTS } from '../../../data/siteShots.ts';
import { docFigureWide } from '../../../utils/docFigureWide.ts';
import { shotSources } from '../../../utils/shotSources.ts';
import FigureFrame from '../FigureFrame/FigureFrame.tsx';
import Shot from '../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../shared/media/ShotCaption/ShotCaption.tsx';
import { COLUMN_SIZES, WIDE_SIZES } from './DocFigure.constants.ts';

type DocFigureProps = { id: string; eager?: boolean; wide?: boolean };

function DocFigure({ id, eager = false, wide: setWide = false }: DocFigureProps) {
  const shot = siteShot(id);
  const wide = setWide || docFigureWide(shot);
  const phone = SITE_SHOTS.find((row) => row.id === `${id}-phone`)?.id;
  const { full, width, height } = shotSources(id);
  const sizes = wide ? WIDE_SIZES : COLUMN_SIZES;
  const sheet: FigureFrameSheet = {
    href: full,
    'data-enlarge': shot.title,
    'data-width': width,
    'data-height': height,
    'data-file-width': Math.max(...shot.widths),
  };

  return (
    <FigureFrame
      sheet={sheet}
      wide={wide}
      picture={<Shot id={id} tall={phone} sizes={sizes} eager={eager} />}
    >
      <ShotCaption id={id} />
    </FigureFrame>
  );
}

export default DocFigure;
