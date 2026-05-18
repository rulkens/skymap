/**
 * PreviewPane — right-column thumbnails for the starless intermediate
 * and the alpha output.  Both update with the responses from
 * /api/process and /api/process/alpha-only respectively.
 *
 * Why two separate <figure> elements?  The starless and alpha images
 * have different lifecycles: /api/process produces both at once,
 * /api/process/alpha-only only refreshes alpha.  Keeping them in
 * separate figures lets Plan D (styling) lay them out independently
 * (side by side, or stacked at narrow widths) without JS involvement.
 *
 * Why placeholder <p> text instead of a spinner?  The component is
 * purely props-driven — it does not know whether a request is in flight.
 * The parent App shows a loading indicator during fetches; the PreviewPane
 * only needs to cover the "nothing yet" case before the first Process.
 */
export type PreviewPaneProps = {
  previews: { starless?: string; alpha?: string };
};

export function PreviewPane(props: PreviewPaneProps) {
  return (
    <section className="curator-preview-pane">
      <figure>
        <figcaption>Starless</figcaption>
        {props.previews.starless ? (
          <img src={props.previews.starless} alt="starless" />
        ) : (
          <p>No starless preview yet — click Process.</p>
        )}
      </figure>
      <figure>
        <figcaption>Alpha</figcaption>
        {props.previews.alpha ? (
          <img src={props.previews.alpha} alt="alpha" />
        ) : (
          <p>No alpha preview yet — click Process.</p>
        )}
      </figure>
    </section>
  );
}
