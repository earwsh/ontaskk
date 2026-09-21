import crypto from 'crypto';

/**
 * Symmetric encryption for credentials stored in the database.
 *
 * A Google refresh token grants long-lived access to the organisation's whole
 * drive, so it must not sit in the database as plaintext where a stray backup
 * or a SQL-injection read would hand it over.
 *
 * AES-256-GCM: the auth tag makes tampering detectable rather than silently
 * decrypting to garbage.
 */
const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error('ENCRYPTION_KEY باید حداقل ۳۲ کاراکتر باشد (در .env تنظیم کنید)');
  }
  // Normalise any passphrase to exactly 32 bytes.
  return crypto.createHash('sha256').update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('payload رمزنگاری‌شده نامعتبر است');
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** True when a key is configured, so routes can fail clearly instead of at use. */
export const encryptionReady = (): boolean =>
  !!process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32;
