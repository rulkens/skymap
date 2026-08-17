/**
 * Configure an rclone S3 remote called `r2` entirely from environment
 * variables, so no credential is ever written to a config file on disk.
 *
 * rclone reads `RCLONE_CONFIG_<REMOTE>_<KEY>` as if it came from
 * rclone.conf, which is why `r2:` resolves without `rclone config`.
 *
 * These are R2's **S3 API** credentials — a different thing from the
 * Cloudflare API token wrangler uses. Create them under R2 → Manage API
 * tokens; `tools/deploy/syncR2Secure.sh` loads them from the OS keychain.
 */
export const RCLONE_REMOTE = 'r2';

export type RcloneCredentials = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

/** The credentials from the environment, or null if any part is missing. */
export function readRcloneCredentials(): RcloneCredentials | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return { accountId, accessKeyId, secretAccessKey };
}

export function rcloneEnv(creds: RcloneCredentials): Record<string, string> {
  return {
    RCLONE_CONFIG_R2_TYPE: 's3',
    RCLONE_CONFIG_R2_PROVIDER: 'Cloudflare',
    RCLONE_CONFIG_R2_ACCESS_KEY_ID: creds.accessKeyId,
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: creds.secretAccessKey,
    RCLONE_CONFIG_R2_ENDPOINT: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    // R2 ignores canned ACLs and rejects the header outright on some paths.
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET: 'true',
  };
}

/** The message shown when a bulk group has files but no credentials to move them. */
export const MISSING_CREDENTIALS_HELP = [
  'Missing R2 S3-API credentials, needed to bulk-upload.',
  '',
  '  Create them: Cloudflare dashboard → R2 → Manage API tokens →',
  '  Create token → Object Read & Write. Then store them:',
  '',
  '    security add-generic-password -a "$USER" -s skymap-r2-account-id        -w "ACCOUNT_ID"',
  '    security add-generic-password -a "$USER" -s skymap-r2-access-key-id     -w "KEY_ID"',
  '    security add-generic-password -a "$USER" -s skymap-r2-secret-access-key -w "SECRET"',
  '',
  '  and run `npm run sync-r2-secure`, which loads them from the keychain.',
].join('\n');
