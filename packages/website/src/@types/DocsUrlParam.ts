/**
 * One parameter the app reads from its address, as the URL parameters page
 * prints it. `part` is where it stands: after the `#` or after the `?`.
 * `skipsWelcome` is whether its presence alone opens the app without the
 * welcome screen, which a test holds to the app's own `deepLink` flag for the
 * `#` ones. `development` marks a flag no visitor needs.
 */
export type DocsUrlParam = {
  name: string;
  part: 'hash' | 'query';
  value: string;
  example: string;
  does: string;
  written: string;
  unknown: string;
  skipsWelcome: boolean;
  development?: true;
};
