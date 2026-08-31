/**
 * WikipediaImagePicker — thumbnail grid of images from the active
 * galaxy's Wikipedia article.  Clicking a thumbnail triggers `onPick`
 * with the mediaviewer-style article URL, which the parent feeds into
 * the same fetch pipeline a manual URL paste goes through (so author +
 * license metadata are extracted automatically).
 *
 * Lifecycle:
 *   - On mount or when `names` changes, the component fetches the
 *     image list once.  Cancellation guards prevent stale resolutions
 *     from overwriting newer state.
 *   - The legend includes a "open article" link so the maintainer can
 *     jump to the source page if a desired image isn't surfaced (e.g.
 *     filtered out as an icon, or buried in a sub-article).
 */
import { useEffect, useState } from 'react';
import { fetchWikipediaArticleImages, type WikipediaImage } from '../wikipediaArticleImages';
import { wikipediaArticleUrl, wikipediaCandidateOrder } from '../wikipediaTitle';

export type WikipediaImagePickerProps = {
  names: ReadonlyArray<string>;
  onPick: (articleUrl: string) => void;
};

type PickerState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; images: WikipediaImage[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export function WikipediaImagePicker(props: WikipediaImagePickerProps) {
  const [state, setState] = useState<PickerState>({ kind: 'idle' });
  const articleHref = wikipediaArticleUrl(props.names);

  useEffect(() => {
    if (props.names.length === 0) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    let cancelled = false;
    const candidates = wikipediaCandidateOrder(props.names);
    fetchWikipediaArticleImages(candidates)
      .then((r) => {
        if (cancelled) return;
        if (!r || r.images.length === 0) setState({ kind: 'empty' });
        else setState({ kind: 'loaded', images: r.images });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: 'error', message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [props.names]);

  return (
    <fieldset className="curator-wiki-picker">
      <legend>
        Wikipedia images
        {articleHref && (
          <>
            {' · '}
            <a
              className="curator-wiki-picker__article-link"
              href={articleHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              article ↗
            </a>
          </>
        )}
      </legend>
      {state.kind === 'idle' && (
        <p className="curator-wiki-picker__hint">Pick a galaxy to see Wikipedia images.</p>
      )}
      {state.kind === 'loading' && <p className="curator-wiki-picker__hint">Loading…</p>}
      {state.kind === 'empty' && (
        <p className="curator-wiki-picker__hint">No Wikipedia images found.</p>
      )}
      {state.kind === 'error' && (
        <p className="curator-wiki-picker__hint">Error: {state.message}</p>
      )}
      {state.kind === 'loaded' && (
        <div className="curator-wiki-picker__grid">
          {state.images.map((img) => (
            <button
              key={img.fileTitle}
              type="button"
              className="curator-wiki-picker__card"
              title={img.fileTitle.replace(/^File:/, '').replace(/_/g, ' ')}
              onClick={() => props.onPick(img.articleUrl)}
            >
              <img src={img.thumbUrl} alt={img.fileTitle} loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
