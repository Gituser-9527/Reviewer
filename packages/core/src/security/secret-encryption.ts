import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  algorithm: 'aes-256-gcm';
}

/** Server-side authenticated encryption for tenant-owned provider credentials. */
export class SecretEncryptionService {
  constructor(
    private readonly key: Buffer,
    private readonly keyVersion = 'env-v1',
  ) {
    if (key.length !== 32) throw new Error('Secret encryption key must be exactly 32 bytes.');
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SecretEncryptionService {
    const encoded = env.LLM_SECRET_ENCRYPTION_KEY;
    if (!encoded) throw new Error('LLM_SECRET_ENCRYPTION_KEY is required for BYOK operations.');
    const key = Buffer.from(encoded, 'base64');
    return new SecretEncryptionService(key, env.LLM_SECRET_ENCRYPTION_KEY_VERSION ?? 'env-v1');
  }

  async encrypt(plaintext: string): Promise<EncryptedSecret> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: this.keyVersion, algorithm: 'aes-256-gcm' };
  }

  async decrypt(secret: EncryptedSecret): Promise<string> {
    if (secret.algorithm !== 'aes-256-gcm') throw new Error('Unsupported secret encryption algorithm.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  async rotate(secret: EncryptedSecret): Promise<EncryptedSecret> {
    return this.encrypt(await this.decrypt(secret));
  }
}
