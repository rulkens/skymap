export type DataRequestRow = {
  readonly dir: string; // the request URL up to and including its last '/'
  readonly outcome: string; // HTTP status (+ ' text/html' for a fallback page), 'FAILED <errorText>' or 'pending'
  readonly count: number;
  readonly bytes: number;
};
