/*
 * DocFigure — `<Figure id="…" />` on a docs page: a picture from the shot
 * manifest with its label and "Open this view", in the docs' FigureFrame. A
 * picture of the app's interface is a wide figure, so its text can be read
 * (utils/docFigureWide.ts). A phone gets the manifest's `<id>-phone` row
 * where there is one. `eager` is for the one picture a page opens on, before
 * its first heading.
 */
import type { FigureFrameSheet } from '../../@types/FigureFrameSheet';
import { siteShot } from '../../data/siteShot.ts';
import { SITE_SHOTS } from '../../data/siteShots.ts';
import { docFigureWide } from '../../utils/docFigureWide.ts';
import { shotSources } from '../../utils/shotSources.ts';
import FigureFrame from '../FigureFrame/FigureFrame.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';

type DocFigureProps = { id: string; eager?: boolean };

function DocFigure({ id, eager = false }: DocFigureProps) {
  const shot = siteShot(id);
  const wide = docFigureWide(shot);
  const phone = SITE_SHOTS.find((row) => row.id === `${id}-phone`)?.id;
  const { full, width, height } = shotSources(id);
  // The picture's box at each layout of DocsLayout: nine columns of the page grid, or the text's seven and then six.
  const sizes = wide
    ? '(max-width: 900px) 100vw, (max-width: 1239px) calc(75vw - 4.875rem), 53.25rem'
    : '(max-width: 900px) 100vw, (max-width: 1199px) calc(58.33vw - 4.46rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem';
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
