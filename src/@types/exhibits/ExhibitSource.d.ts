/** ExhibitSource — one provenance row of an `Exhibit`: a role, a linked title, its citation. */

export type ExhibitSource = {
  role: string;
  title: string;
  citation: string;
  href: string;
  /** The link plays a video; the row shows a play icon before its title. */
  video?: true;
};
