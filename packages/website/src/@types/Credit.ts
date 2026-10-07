/** One image or data credit on Home: the maker, where it comes from, and the licence as ATTRIBUTIONS.md records it under the entry whose id is `entry`. `licenceHref` is absent where the licence is a public release with no licence text of its own. */
export type Credit = {
  entry: string;
  name: string;
  href: string;
  licence: string;
  licenceHref?: string;
};
