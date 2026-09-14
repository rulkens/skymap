/**
 * Per-kind parent rung: the body arm's parent is the world arm. The site
 * arm's entry (`site: 'body'`) lands with the feature PR, not here.
 */
export type ParentOf = { readonly body: 'absolute' };
