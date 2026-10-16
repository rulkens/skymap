/*
 * ContactForm — the commission enquiry, an island: it posts four fields and a
 * Turnstile token as JSON to `endpoint`, and only reports what the server
 * answered, so "sent" is never shown for a message that was not accepted. The
 * page places it only when an endpoint and site key are configured
 * (data/contact.ts, build-time values the island cannot read, so they arrive as
 * props); otherwise it places ContactClosed. The Turnstile script, a
 * third-party request, loads when the island hydrates, which is when the form
 * scrolls into view. The spam check needs script, so without it the form says
 * so and points to GitHub.
 */
import { useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';

import type { TurnstileApi } from '../../@types/TurnstileApi';
import ContactField from './ContactField.tsx';
import styles from './ContactForm.module.css';

type ContactFormProps = {
  endpoint: string;
  siteKey: string;
  privacyHref: string;
  issuesHref: string;
};

const FIELDS = [
  {
    name: 'name',
    label: 'Your name',
    autoComplete: 'name',
    missing: 'Enter your name.',
  },
  {
    name: 'organisation',
    label: 'Organisation',
    autoComplete: 'organization',
    missing: 'Enter the name of your dome, museum or organisation.',
  },
  {
    name: 'email',
    label: 'Email address',
    type: 'email',
    autoComplete: 'email',
    hint: 'We use it only to answer you.',
    missing: 'Enter an email address, like name@example.org.',
  },
  {
    name: 'message',
    label: 'What you have in mind',
    multiline: true,
    hint: 'The dome or room, the screen, the audience, and a date if there is one. A few lines are enough.',
    missing: 'Tell us in a line or two what you have in mind.',
  },
] as const;

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const turnstile = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;

function ContactForm({ endpoint, siteKey, privacyHref, issuesHref }: ContactFormProps) {
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const widget = useRef<HTMLDivElement>(null);
  // A token is single-use: reset after every attempt.
  const check = useRef({ token: '', blocked: false, widgetId: undefined as string | undefined });
  // The message of every field the last submit checked ('' for one that passed).
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<{ id: string; message: string }[]>([]);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Our own messages replace the browser's bubbles, which screen readers announce unevenly.
    form.current!.noValidate = true;
    const state = check.current;
    const script = Object.assign(document.createElement('script'), {
      src: TURNSTILE_SCRIPT,
      async: true,
      onerror: () => (state.blocked = true),
      onload: () => {
        state.widgetId = turnstile()?.render(widget.current!, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (value: string) => (state.token = value),
          'expired-callback': () => (state.token = ''),
          'error-callback': () => (state.token = ''),
        });
      },
    });
    document.head.append(script);
  }, [siteKey]);

  useEffect(() => {
    if (problems.length > 0) summary.current?.focus();
  }, [problems]);

  // Fields are checked on submit only: a message that vanished on blur would move the button out from under a click.
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = form.current!;
    const state = check.current;
    setStatus('');
    const checked = FIELDS.map((field) => {
      const control = element.elements.namedItem(field.name) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      const empty = control.value.trim() === '';
      return {
        id: control.id,
        name: field.name,
        message: empty || !control.validity.valid ? field.missing : '',
      };
    });
    setErrors(Object.fromEntries(checked.map((item) => [item.name, item.message])));
    const found = checked.filter((item) => item.message);
    setProblems(found);
    if (found.length > 0) return;
    if (!state.token) {
      setStatus(
        state.blocked
          ? 'The spam check could not load, so this form cannot send from your browser. The issue list on GitHub reaches us too.'
          : 'The spam check has not finished. Wait a moment, then send again.',
      );
      return;
    }
    setSending(true);
    setStatus('Sending.');
    try {
      const { 'cf-turnstile-response': _widget, ...values } = Object.fromEntries(
        new FormData(element),
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...values, token: state.token }),
      });
      if (!response.ok) throw new Error(String(response.status));
      element.reset();
      setStatus('Your message has been sent.');
    } catch (failure) {
      setStatus(
        failure instanceof Error && failure.message === '403'
          ? 'The spam check did not pass. What you wrote is still in the form. Send it again.'
          : 'The message was not sent. What you wrote is still in the form. Try again in a few minutes.',
      );
    } finally {
      state.token = '';
      if (state.widgetId) turnstile()?.reset(state.widgetId);
      setSending(false);
    }
  };

  return (
    <form ref={form} className={styles.root} method="post" action={endpoint} onSubmit={submit}>
      <div
        ref={summary}
        className={styles.summary}
        role="alert"
        tabIndex={-1}
        hidden={problems.length === 0}
      >
        {problems.length > 0 && (
          <>
            <p>
              {`The message was not sent. ${problems.length === 1 ? 'One field needs' : `${problems.length} fields need`} attention.`}
            </p>
            {problems.map((problem) => (
              <a key={problem.id} href={`#${problem.id}`}>
                {problem.message}
              </a>
            ))}
          </>
        )}
      </div>
      <p className={styles.note}>All four fields are needed.</p>
      {FIELDS.map((field) => (
        <ContactField key={field.name} {...field} error={errors[field.name]} />
      ))}
      {/* Honeypot: people never see or reach this field; a filled one marks the post as automated. */}
      <div className={styles.leave} aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className={styles.note}>
        Sending this gives us these four fields as an email. We use them to answer you and for
        nothing else. What we keep, and for how long, is on the{' '}
        <a href={privacyHref}>privacy page</a>.
      </p>
      <div ref={widget} className={styles.check} />
      <noscript>
        <p className={styles.note}>
          The spam check needs JavaScript, so this form cannot send without it. The{' '}
          <a href={issuesHref}>issue list on GitHub</a> is public.
        </p>
      </noscript>
      <button className={styles.send} type="submit" disabled={sending}>
        Send the message
      </button>
      <p className={styles.status} role="status">
        {status}
      </p>
    </form>
  );
}

export default ContactForm;
