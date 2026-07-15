import { randomUUID } from 'node:crypto';
import { hashSensitiveValue, redactSensitiveInfo } from '@job-compliance/core';
import type { CreateTrialRequestInput } from './schemas.js';

export interface TrialRequest {
  id: string;
  companyName: string;
  contactName: string;
  /** Stored only in masked form to support privacy-preserving outreach tracking. */
  emailMasked: string;
  /** SHA-256 hash used for de-duplication; the raw email is never retained. */
  emailHash: string;
  companySize?: string;
  useCase?: string;
  status: 'received';
  createdAt: string;
}

export interface TrialRequestReceipt {
  id: string;
  status: TrialRequest['status'];
  createdAt: string;
}

/** In-memory MVP store. A future repository can persist the same privacy-safe record shape. */
export class TrialRequestService {
  private readonly requests = new Map<string, TrialRequest>();

  create(input: CreateTrialRequestInput): TrialRequestReceipt {
    const now = new Date().toISOString();
    const record: TrialRequest = {
      id: `trial_${randomUUID()}`,
      companyName: redactSensitiveInfo(input.companyName),
      contactName: redactSensitiveInfo(input.contactName),
      emailMasked: redactSensitiveInfo(input.email),
      emailHash: hashSensitiveValue(input.email.toLowerCase()),
      ...(input.companySize === undefined ? {} : { companySize: input.companySize }),
      ...(input.useCase === undefined ? {} : { useCase: redactSensitiveInfo(input.useCase) }),
      status: 'received',
      createdAt: now,
    };
    this.requests.set(record.id, structuredClone(record));
    return { id: record.id, status: record.status, createdAt: record.createdAt };
  }

  /** Test-only inspection without exposing raw contact data. */
  get(id: string): TrialRequest | undefined {
    const record = this.requests.get(id);
    return record === undefined ? undefined : structuredClone(record);
  }
}
