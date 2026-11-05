/** Per-kind parent arm: the body arm's parent is the world arm; a site's and a sky spot's is their host's body arm. */
export type ParentOf = { readonly body: 'absolute'; readonly site: 'body'; readonly sky: 'body' };
