/**
 * One paper or dataset to cite for a source, as its publisher's record states
 * it. `journal` carries volume and page; `checked` is the day the DOI's record
 * (and the arXiv record, where `arxiv` is given) was opened and compared.
 */
export type CiteRef = {
  readonly authors: string;
  readonly year: number;
  readonly title: string;
  readonly journal: string;
  readonly doi?: string;
  readonly arxiv?: string;
  readonly checked: string;
};
