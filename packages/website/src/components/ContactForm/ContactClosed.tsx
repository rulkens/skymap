/*
 * ContactClosed — what the contact form's place says while no endpoint and
 * site key are configured (data/contact.ts): a plain message, and the way to
 * reach us meanwhile. Static; the page chooses it over ContactForm.
 */
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './ContactClosed.module.css';

type ContactClosedProps = { privacyHref: string; issuesHref: string };

function ContactClosed({ privacyHref, issuesHref }: ContactClosedProps) {
  return (
    <div className={styles.root}>
      <p className={styles.lead}>The contact form is not open yet.</p>
      <p>
        Until it is, open an issue on GitHub and say only that you would like to talk about a dome
        or an exhibit. We will reply with an address. Issues are public, so leave the details for
        the email.
      </p>
      <ObjLink hang href={issuesHref}>
        Open an issue on GitHub
      </ObjLink>
      <p className={styles.note}>
        What the site and the app load and keep today, and the plan for this form, are on the{' '}
        <a href={privacyHref}>privacy page</a>.
      </p>
    </div>
  );
}

export default ContactClosed;
