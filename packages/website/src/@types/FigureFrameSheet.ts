/**
 * The link a docs picture is, and the attributes FigureSheet reads from it
 * (components/FigureFrame/FigureFrame.tsx): the address of the picture's
 * largest file, its title, the size the app drew it at and the file's width.
 */
export type FigureFrameSheet = {
  href: string;
  'data-enlarge': string;
  'data-width': number;
  'data-height': number;
  'data-file-width': number;
};
