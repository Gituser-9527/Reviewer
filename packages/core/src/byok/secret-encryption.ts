import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
export interface EncryptedSecret { version: 'v1'; iv: string; tag: string; ciphertext: string; }
export interface SecretEncryptionService { encrypt(plaintext: string): Promise<EncryptedSecret>; decrypt(secret: EncryptedSecret): Promise<string>; }
/** AES-256-GCM envelope encryption; the 32-byte master key is injected at process start and never persisted. */
export class AesGcmSecretEncryptionService implements SecretEncryptionService {
  constructor(private readonly key: Buffer) { if (key.length !== 32) throw new Error('LLM_ENCRYPTION_KEY must decode to exactly 32 bytes.'); }
  static fromBase64(value: string | undefined): AesGcmSecretEncryptionService { if (!value) throw new Error('LLM_ENCRYPTION_KEY is required.'); return new AesGcmSecretEncryptionService(Buffer.from(value, 'base64')); }
  async encrypt(plaintext: string): Promise<EncryptedSecret> { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv); const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]); return { version: 'v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }; }
  async decrypt(secret: EncryptedSecret): Promise<string> { const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(secret.iv, 'base64')); decipher.setAuthTag(Buffer.from(secret.tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]).toString('utf8'); }
}
export const maskApiKey = (value: string): string => value.length < 6 ? '****' : `${value.slice(0, 3)}-****${value.slice(-4)}`;
