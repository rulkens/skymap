/** Per-kind parent rung: the body arm's parent is the world arm, a site's is its host's body arm. */
export type ParentOf = { readonly body: 'absolute'; readonly site: 'body' };
