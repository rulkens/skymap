/*
 * ContactClosed — what the contact form's place says while no endpoint and
 * site key are configured (data/contact.ts): the address to write to, printed
 * as text so it can be copied where no mail program opens, and the issue list
 * for faults. Static; the page chooses it over ContactForm.
 */
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import styles from './ContactClosed.module.css';

type ContactClosedProps = { email: string; issuesHref: string };

function ContactClosed({ email, issuesHref }: ContactClosedProps) {
  return (
    <div className={styles.root}>
      <p className={styles.lead}>
        <a href={`mailto:${email}`}>{email}</a>
      </p>
      <p>
        A few lines are enough: the dome or the room, the screen, the audience, and a date if there
        is one.
      </p>
      <p className={styles.note}>To report a fault in the app, open an issue. Issues are public.</p>
      <ObjLink hang size="small" href={issuesHref}>
        Open an issue on GitHub
      </ObjLink>
    </div>
  );
}

export default ContactClosed;
