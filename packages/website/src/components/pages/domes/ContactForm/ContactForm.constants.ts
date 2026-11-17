export const FIELDS = [
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

export const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
