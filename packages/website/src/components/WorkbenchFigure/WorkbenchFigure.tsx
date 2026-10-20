/*
 * WorkbenchFigure — `<WorkbenchFigure id="galaxy" />` on a docs page: the
 * picture of one workbench (data/workbenches.ts) with its label, in the
 * docs' FigureFrame. A workbench is not a view of the app, so it is not a row
 * of the shot manifest and its label has no "Open this view". It stays in
 * the text column: six wide figures one after another kept the page's list
 * of headings half hidden for the whole page, and no width in a column
 * makes a tool's labels readable; "Enlarge" does.
 */
import type { FigureFrameSheet } from '../../@types/FigureFrameSheet';
import { WORKBENCHES, WORKBENCH_WIDTHS, WORKBENCH_WINDOW } from '../../data/workbenches.ts';
import FigureFrame from '../FigureFrame/FigureFrame.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';

type WorkbenchFigureProps = { id: string };

const FILES = import.meta.glob<string>('../../assets/workbenches/*.{avif,webp}', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});

// As DocFigure's figure in the column: the screen, then the text's seven columns, then its six.
const SIZES =
  '(max-width: 900px) 100vw, (max-width: 1199px) calc(58.33vw - 4.46rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem';

function WorkbenchFigure({ id }: WorkbenchFigureProps) {
  const row = WORKBENCHES.find((workbench) => workbench.id === id);
  if (!row) throw new Error(`Unknown workbench "${id}" (see src/data/workbenches.ts)`);

  const url = (width: number, ext: string) => {
    const file = FILES[`../../assets/workbenches/${id}-${width}.${ext}`];
    if (!file)
      throw new Error(
        `No ${ext} at ${width}px for workbench "${id}": run tools/site/shootWorkbench.ts`,
      );
    return file;
  };
  const srcSet = (ext: string) =>
    WORKBENCH_WIDTHS.map((width) => `${url(width, ext)} ${width}w`).join(', ');
  const widest = Math.max(...WORKBENCH_WIDTHS);
  const sheet: FigureFrameSheet = {
    href: url(widest, 'webp'),
    'data-enlarge': row.picture.title,
    'data-width': WORKBENCH_WINDOW.width,
    'data-height': WORKBENCH_WINDOW.height,
    'data-file-width': widest,
  };

  return (
    <FigureFrame
      sheet={sheet}
      picture={
        <picture>
          <source
            type="image/avif"
            srcSet={srcSet('avif')}
            sizes={SIZES}
            width={WORKBENCH_WINDOW.width}
            height={WORKBENCH_WINDOW.height}
          />
          <img
            src={url(Math.min(...WORKBENCH_WIDTHS), 'webp')}
            srcSet={srcSet('webp')}
            sizes={SIZES}
            width={WORKBENCH_WINDOW.width}
            height={WORKBENCH_WINDOW.height}
            alt={row.picture.alt}
            loading="lazy"
            decoding="async"
          />
        </picture>
      }
    >
      <ShotCaption label={row.picture} />
    </FigureFrame>
  );
}

export default WorkbenchFigure;
