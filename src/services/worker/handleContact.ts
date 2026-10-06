/**
 * POST /api/contact: the website's form, forwarded by email. Stateless — no
 * storage, and the only thing ever logged is the provider's error code. While
 * any of the four configuration values is missing it answers 503 before
 * reading anything, which is what keeps it inert until the owner opens it.
 * It answers 200 only once the provider accepted the message.
 */
import type { WorkerEnv } from '../../@types/worker/WorkerEnv';
import { CONTACT_LIMITS } from '../../data/worker/contactConfig';
import { buildContactMail } from '../../utils/worker/buildContactMail';
import { readBodyText } from '../../utils/worker/readBodyText';
import { validateContactFields } from '../../utils/worker/validateContactFields';
import { verifyTurnstile } from '../../utils/worker/verifyTurnstile';

const reply = (status: number, body: Record<string, unknown>): Response =>
  Response.json(body, { status });

export async function handleContact(request: Request, env: WorkerEnv): Promise<Response> {
  const {
    CONTACT_EMAIL: mailer,
    CONTACT_TO: to,
    CONTACT_FROM: from,
    TURNSTILE_SECRET_KEY: secret,
  } = env;
  if (!mailer || !to || !from || !secret) return reply(503, { error: 'not_configured' });

  // A browser always sends Origin on a POST; the form lives on this origin, so anything else is not our form.
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    return reply(403, { error: 'origin' });
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return reply(415, { error: 'content_type' });
  }
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  const text =
    declared > CONTACT_LIMITS.bodyBytes
      ? undefined
      : await readBodyText(request, CONTACT_LIMITS.bodyBytes);
  if (text === undefined) return reply(413, { error: 'too_large' });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: 'invalid', field: 'body' });
  }
  const check = validateContactFields(body);
  if (check.kind === 'honeypot') return reply(200, { ok: true });
  if (check.kind === 'invalid') return reply(400, { error: 'invalid', field: check.field });

  const spam = await verifyTurnstile(check.token, secret);
  if (spam === 'failed') return reply(403, { error: 'spam_check' });
  if (spam === 'unavailable') return reply(502, { error: 'spam_check_unavailable' });

  try {
    await mailer.send(buildContactMail(check.fields, to, from));
  } catch (error) {
    console.error('contact send failed', (error as { code?: unknown }).code);
    return reply(502, { error: 'send_failed' });
  }
  return reply(200, { ok: true });
}
