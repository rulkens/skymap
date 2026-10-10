import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactMail } from '../../../src/@types/worker/ContactMail';
import type { WorkerEnv } from '../../../src/@types/worker/WorkerEnv';
import {
  CONTACT_LIMITS,
  CONTACT_PATH,
  TURNSTILE_VERIFY_URL,
} from '../../../src/data/worker/contactConfig';
import { handleContact } from '../../../src/services/worker/handleContact';

const ORIGIN = 'https://skymap.example';
const body = {
  name: 'Ada',
  organisation: 'Wisdome',
  email: 'ada@example.org',
  message: 'A dome of 12 m <b>and</b> a date.',
  website: '',
  token: 'turnstile-token',
};

const send = vi.fn<(mail: ContactMail) => Promise<{ messageId: string }>>();
const verify = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

const configured = (): WorkerEnv => ({
  ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
  CONTACT_EMAIL: { send },
  CONTACT_TO: 'inbox@dest.test',
  CONTACT_FROM: 'site@sender.test',
  TURNSTILE_SECRET_KEY: 'secret',
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${CONTACT_PATH}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const answer = async (response: Response) => ({
  status: response.status,
  json: await response.json(),
});

beforeEach(() => {
  send.mockReset().mockResolvedValue({ messageId: 'm1' });
  verify.mockReset().mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal('fetch', verify);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('handleContact', () => {
  it.each(['CONTACT_EMAIL', 'CONTACT_TO', 'CONTACT_FROM', 'TURNSTILE_SECRET_KEY'] as const)(
    'answers 503 and does nothing else while %s is missing',
    async (missing) => {
      const env = { ...configured(), [missing]: undefined };
      expect(await answer(await handleContact(post(body), env))).toEqual({
        status: 503,
        json: { error: 'not_configured' },
      });
      expect(verify).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('answers 503 with no configuration at all, before reading the body', async () => {
    const response = await handleContact(post(body), { ASSETS: configured().ASSETS });
    expect(response.status).toBe(503);
  });

  it.each([
    ['another origin', { Origin: 'https://evil.example' }],
    ['no Origin header', { Origin: '' }],
  ])('refuses %s with 403', async (_label, headers) => {
    const response = await handleContact(post(body, headers), configured());
    expect(await answer(response)).toEqual({ status: 403, json: { error: 'origin' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON with 415', async () => {
    const response = await handleContact(
      post('a=b', { 'Content-Type': 'application/x-www-form-urlencoded' }),
      configured(),
    );
    expect(response.status).toBe(415);
  });

  it('refuses a body over the cap with 413, declared or not', async () => {
    const big = JSON.stringify({ ...body, message: 'x'.repeat(CONTACT_LIMITS.bodyBytes) });
    expect((await handleContact(post(big), configured())).status).toBe(413);
    const lying = post(big, { 'Content-Length': '10' });
    expect((await handleContact(lying, configured())).status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });

  it('answers 400 for malformed JSON', async () => {
    expect(await answer(await handleContact(post('{nope'), configured()))).toEqual({
      status: 400,
      json: { error: 'invalid', field: 'body' },
    });
  });

  it('answers 400 naming the missing field, without spending a spam check', async () => {
    const response = await handleContact(post({ ...body, email: '' }), configured());
    expect(await answer(response)).toEqual({
      status: 400,
      json: { error: 'invalid', field: 'email' },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('answers 200 to a filled honeypot and sends nothing, checks nothing', async () => {
    const response = await handleContact(
      post({ ...body, website: 'http://spam.example' }),
      configured(),
    );
    expect(await answer(response)).toEqual({ status: 200, json: { ok: true } });
    expect(send).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('answers 403 when Turnstile rejects the token, and sends nothing', async () => {
    verify.mockResolvedValue(
      Response.json({ success: false, 'error-codes': ['invalid-input-response'] }),
    );
    const response = await handleContact(post(body), configured());
    expect(await answer(response)).toEqual({ status: 403, json: { error: 'spam_check' } });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['answers an error status', () => Promise.resolve(new Response('', { status: 500 }))],
    ['cannot be reached', () => Promise.reject(new Error('network'))],
  ])('answers 502, not a spam verdict, when Turnstile %s', async (_label, impl) => {
    verify.mockImplementation(impl);
    const response = await handleContact(post(body), configured());
    expect(await answer(response)).toEqual({
      status: 502,
      json: { error: 'spam_check_unavailable' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('answers 502 when the email provider refuses, and logs only its code', async () => {
    send.mockRejectedValue(
      Object.assign(new Error('Ada wrote: A dome'), { code: 'E_SENDER_NOT_VERIFIED' }),
    );
    const response = await handleContact(post(body), configured());
    expect(await answer(response)).toEqual({ status: 502, json: { error: 'send_failed' } });
    expect(console.error).toHaveBeenCalledWith('contact send failed', 'E_SENDER_NOT_VERIFIED');
  });

  it('on success answers 200 after exactly one send, replying to the visitor, as plain text', async () => {
    const response = await handleContact(post(body), configured());
    expect(await answer(response)).toEqual({ status: 200, json: { ok: true } });

    expect(verify).toHaveBeenCalledOnce();
    const [url, init] = verify.mock.calls[0]!;
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      secret: 'secret',
      response: 'turnstile-token',
    });

    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0]![0];
    expect(mail.replyTo).toBe('ada@example.org');
    expect(mail.to).toBe('inbox@dest.test');
    expect(mail.from.email).toBe('site@sender.test');
    expect(mail).not.toHaveProperty('html');
    expect(mail.text).toContain('A dome of 12 m');
    // Everything outside the visitor's own message is ours, and ours has no markup.
    expect(mail.text.replace(body.message, '')).not.toMatch(/[<>]/);
    expect(mail.subject).not.toMatch(/[<>\r\n]/);
  });

  it('logs nothing on success', async () => {
    await handleContact(post(body), configured());
    expect(console.error).not.toHaveBeenCalled();
  });
});
