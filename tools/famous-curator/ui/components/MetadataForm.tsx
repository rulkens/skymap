/**
 * MetadataForm — sourceUrl / license / author inputs.  All three are
 * required for Export; the form just reports values upward, the
 * canExport selector in state.ts enforces the validity gate.
 *
 * Why purely props-driven (no local state)?  The parent App holds the
 * single authoritative State blob via useReducer.  Keeping MetadataForm
 * stateless means the values survive a panel re-mount or future tab
 * switching without any syncing logic here.
 *
 * Why a <fieldset> with <legend>?  Groups the three attribution inputs
 * under a semantic boundary that screen-readers announce as a unit, and
 * gives Plan D (styling) a natural CSS scope without a wrapper div.
 */
import type { MetadataParams } from '../state';

export type MetadataFormProps = {
  metadata: MetadataParams;
  onChange: (m: MetadataParams) => void;
};

export function MetadataForm(props: MetadataFormProps) {
  // Merge a partial patch into the current metadata and report upward.
  // Spreading props.metadata first preserves every field that this
  // particular onChange didn't touch — avoids losing sourceUrl when the
  // user edits author, for example.
  const set = (patch: Partial<MetadataParams>) => props.onChange({ ...props.metadata, ...patch });
  // Labels are collapsed into placeholders to make the Attribution
  // block compact (it lives below the crop canvas where vertical
  // room is at a premium).  aria-label keeps the accessible name
  // present for screen readers without rendering a visible <label>.
  return (
    <fieldset className="curator-metadata-form">
      <legend>Attribution</legend>
      <input
        type="url"
        placeholder="source url"
        aria-label="source url"
        value={props.metadata.sourceUrl}
        onChange={(e) => set({ sourceUrl: e.target.value })}
      />
      <input
        type="text"
        placeholder="license"
        aria-label="license"
        value={props.metadata.license}
        onChange={(e) => set({ license: e.target.value })}
      />
      <input
        type="text"
        placeholder="author"
        aria-label="author"
        value={props.metadata.author}
        onChange={(e) => set({ author: e.target.value })}
      />
    </fieldset>
  );
}
