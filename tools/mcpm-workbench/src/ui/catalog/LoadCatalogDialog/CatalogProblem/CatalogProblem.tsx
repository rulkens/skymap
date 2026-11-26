/** CatalogProblem — why the file cannot load, at the foot of the form, with an example of the expected rows when that helps. */
import type { ReactNode } from 'react';
import FormField from '../../../panel/FormField/FormField';
import styles from './CatalogProblem.module.css';

export type CatalogProblemProps = {
  readonly message: string;
  /** Rows in the chosen format; null shows none. */
  readonly example: readonly string[] | null;
};

function CatalogProblem({ message, example }: CatalogProblemProps): ReactNode {
  return (
    <div className={styles.root}>
      <p role="alert" className={styles.problem}>
        {message}
      </p>
      {example && (
        <FormField label="Example">
          {(ids) => (
            <pre id={ids.control} className={styles.example}>
              {example.join('\n')}
            </pre>
          )}
        </FormField>
      )}
    </div>
  );
}

export default CatalogProblem;
