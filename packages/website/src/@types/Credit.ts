/** One image or data credit on Home: the maker, where it comes from, and the licence as ATTRIBUTIONS.md records it. `licenceHref` is absent where the licence is a public release with no licence text of its own. */
export type Credit = {
  name: string;
  href: string;
  licence: string;
  licenceHref?: string;
};
