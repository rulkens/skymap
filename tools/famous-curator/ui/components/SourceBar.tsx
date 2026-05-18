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
  return (
    <div className="curator-source-bar">
      <label>
        source url to fetch
        <input
          type="url" value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={props.disabled}
        />
      </label>
      <button
        onClick={() => props.onFetch(url)}
        disabled={props.disabled || props.busy || url.length === 0}
      >
        {props.busy ? <span className="curator-spinner" aria-hidden="true" /> : null}
        Fetch
      </button>
    </div>
  );
}
