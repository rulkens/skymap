/**
 * SourceBar — URL input + Fetch button shown above the crop canvas.
 * Drag-drop happens on the CropCanvas itself; this bar is the URL
 * path.
 */
import { useState } from 'react';

export type SourceBarProps = {
  disabled?: boolean;
  busy?: boolean;
  onFetch: (url: string) => void;
};

export function SourceBar(props: SourceBarProps) {
  const [url, setUrl] = useState('');
  // Shared by the Fetch button and Enter-in-the-field so both honour the same
  // guard: a galaxy must be selected, no fetch in flight, and a URL present.
  const canFetch = !props.disabled && !props.busy && url.length > 0;
  const submit = () => {
    if (canFetch) props.onFetch(url);
  };
  return (
    <div className="curator-source-bar">
      <label>
        source url to fetch
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="https://..."
          disabled={props.disabled}
        />
      </label>
      <button onClick={submit} disabled={!canFetch}>
        {props.busy ? <span className="curator-spinner" aria-hidden="true" /> : null}
        Fetch
      </button>
    </div>
  );
}
