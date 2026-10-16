const KEYS_SEEN_KEY = 'skymap-review-keys-seen';

/** True the first time in this browser, so the Keys box opens by itself once and is closed after that until asked for. */
export function claimKeysIntro(): boolean {
  try {
    if (localStorage.getItem(KEYS_SEEN_KEY)) return false;
    localStorage.setItem(KEYS_SEEN_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
