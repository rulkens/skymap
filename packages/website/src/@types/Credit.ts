/** One image or data credit on Home: the maker, where it comes from, and the licence in our words, as ATTRIBUTIONS.md records it under the entry whose id is `entry`. */
export type Credit = {
  entry: string;
  name: string;
  href: string;
  licence: string;
};
