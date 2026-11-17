/**
 * One term of the glossary. `id` is its anchor on the glossary page
 * (`/docs/reference/glossary/#redshift`), so it must not change once another
 * page links to it. `text` is the definition, one or two sentences. `facts`
 * are the sourced rows of data/facts.ts the definition rests on; every term
 * has at least one. `source` is the id of the term's row in
 * data/dataSources.ts when it names a catalogue: the page links to the
 * catalogue's own site and to the Science page's table from it. `more` is the
 * site page that says more, and `see` other terms by id.
 */
export type GlossaryTerm = {
  id: string;
  term: string;
  text: string;
  facts: readonly string[];
  source?: string;
  more?: { label: string; path: string };
  see?: readonly string[];
};
