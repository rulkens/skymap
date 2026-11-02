export const FILES = import.meta.glob<string>('../../../assets/workbenches/*.{avif,webp}', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
});
// As DocFigure's figure in the column: the screen, then the text's seven columns, then its six.
export const SIZES =
  '(max-width: 900px) 100vw, (max-width: 1199px) calc(58.33vw - 4.46rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem';
