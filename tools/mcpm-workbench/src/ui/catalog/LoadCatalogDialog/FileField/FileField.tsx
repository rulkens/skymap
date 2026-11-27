/** FileField — the load dialog's File row: Choose file…, and the chosen name or the formats it takes. */
import { useId, useRef, type ReactNode } from 'react';
import Button from '../../../../../../../packages/shared/src/components/common/Button/Button';
import FormField from '../../../panel/FormField/FormField';
import { NAME_END_CHARS } from '../data/nameEndChars.constant';
import controls from '../dialogControl.module.css';
import styles from './FileField.module.css';

export type FileFieldProps = {
  /** The chosen files' name; null before a choice. */
  readonly filesName: string | null;
  readonly onChoose: (files: readonly File[]) => void;
};

function FileField({ filesName, onChoose }: FileFieldProps): ReactNode {
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <FormField label="File">
      {(ids) => (
        <div id={ids.control} className={styles.root}>
          <Button
            className={controls.button}
            aria-describedby={statusId}
            onClick={() => inputRef.current?.click()}
          >
            Choose file…
          </Button>
          {/* One line either way, the name cut in the middle so its end shows. */}
          <span id={statusId} className={styles.status}>
            {filesName === null ? (
              // What classifyCatalogFiles accepts.
              <span className={styles.formats}>.csv, or .bin + _metadata.txt</span>
            ) : (
              <>
                <span className={styles.nameStart}>{filesName.slice(0, -NAME_END_CHARS)}</span>
                <span className={styles.nameEnd}>{filesName.slice(-NAME_END_CHARS)}</span>
              </>
            )}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.dat,.bin"
            multiple
            hidden
            onChange={(e) => {
              const chosen = Array.from(e.target.files ?? []);
              e.target.value = ''; // so choosing the same file again still fires
              if (chosen.length > 0) onChoose(chosen);
            }}
          />
        </div>
      )}
    </FormField>
  );
}

export default FileField;
