import crypto from 'node:crypto';
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export function encryptSecret(value: string, encodedKey: string): string {
  const key = Buffer.from(encodedKey, 'base64url'); if (key.length !== 32) throw new Error('MASTER_KEY must decode to 32 bytes');
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
export function decryptSecret(payload: string, encodedKey: string): string {
  const key = Buffer.from(encodedKey, 'base64url'); const bytes = Buffer.from(payload, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
export function isSafeHost(host: string): boolean { return /^[a-zA-Z0-9._:-]{1,253}$/.test(host) && !['0.0.0.0','::','localhost'].includes(host.toLowerCase()); }
