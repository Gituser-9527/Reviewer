import { SecretEncryptionService } from './secret-encryption.js';
import { expect, it } from 'vitest';

it('encrypts, decrypts and rotates without retaining plaintext', async () => {
  const service = new SecretEncryptionService(Buffer.alloc(32, 7), 'test-v1');
  const encrypted = await service.encrypt('sk-secret-value');
  expect(encrypted.ciphertext).not.toContain('sk-secret-value');
  expect(await service.decrypt(encrypted)).toBe('sk-secret-value');
  expect(await service.decrypt(await service.rotate(encrypted))).toBe('sk-secret-value');
});
