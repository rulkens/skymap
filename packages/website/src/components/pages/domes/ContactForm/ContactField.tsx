/*
 * ContactField — one labelled field of the contact form: its label, an optional
 * hint under it, the control and the error the form's check puts below it.
 * `error` is undefined until the form has been submitted once; after that it
 * is the message, or an empty string for a field that passed.
 */
import styles from './ContactField.module.css';

type ContactFieldProps = {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
  error?: string;
};

function ContactField({
  name,
  label,
  hint,
  type = 'text',
  autoComplete,
  multiline = false,
  error,
}: ContactFieldProps) {
  const id = `contact-${name}`;
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  const control = {
    id,
    name,
    required: true,
    'aria-invalid': error === undefined ? undefined : error !== '',
    'aria-describedby': described || undefined,
  };
  return (
    <div className={styles.root}>
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea {...control} rows={6} />
      ) : (
        <input {...control} type={type} autoComplete={autoComplete} />
      )}
      <p className={styles.error} id={`${id}-error`} hidden={!error}>
        {error}
      </p>
    </div>
  );
}

export default ContactField;
