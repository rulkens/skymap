import type { PictureJudgement } from './PictureJudgement';

/**
 * What `npm run site:judge` writes as `report.json`: per window width, the page's sections, every
 * site-shot picture and video in `<main>` in page order, and the contact sheet's file. `notShown`
 * lists the shots with no box at that width (a picture for the other layout).
 */
export type PictureReport = {
  page: string;
  url: string;
  dpr: number;
  widths: {
    width: number;
    contactSheet: string;
    sections: string[];
    pictures: PictureJudgement[];
    notShown: string[];
  }[];
};
