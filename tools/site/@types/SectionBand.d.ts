/**
 * One h2 section of a site page: its heading's text and the vertical extent of its band (the outermost
 * box between the heading and `<main>`), in CSS pixels from the top of the page.
 */
export type SectionBand = {
  text: string;
  y: number;
  h: number;
};
