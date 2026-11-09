import type { StellarStreamMeta } from '../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import type { StreamWikipedia } from '../@types/StreamWikipedia';

/** The meta fields an article sets: its title and its extract, the stream's only description. */
export function streamArticleFields(
  wikipedia: StreamWikipedia | null,
): Pick<StellarStreamMeta, 'description' | 'wikipediaTitle'> {
  return {
    description: wikipedia?.extract || null,
    wikipediaTitle: wikipedia?.title ?? null,
  };
}
