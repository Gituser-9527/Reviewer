import { randomUUID } from 'node:crypto';
import type { Role } from '../auth/service.js';

export type OnboardingStatus = 'not_started' | 'dismissed' | 'completed';

export interface OnboardingRecord {
  id: string;
  userId: string;
  tenantId?: string;
  role: Role;
  status: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

function keyFor(input: Pick<OnboardingRecord, 'userId' | 'tenantId' | 'role'>): string {
  return `${input.tenantId ?? 'global'}:${input.userId}:${input.role}`;
}

/** Stores onboarding progress independently from mandatory reviewer training confirmation. */
export class OnboardingService {
  private readonly records = new Map<string, OnboardingRecord>();

  getStatus(input: Pick<OnboardingRecord, 'userId' | 'tenantId' | 'role'>): OnboardingRecord {
    const existing = this.records.get(keyFor(input));
    if (existing !== undefined) return structuredClone(existing);

    const now = new Date().toISOString();
    return {
      id: `onboarding_${randomUUID()}`,
      userId: input.userId,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      role: input.role,
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    };
  }

  dismiss(input: Pick<OnboardingRecord, 'userId' | 'tenantId' | 'role'>): OnboardingRecord {
    return this.save(input, 'dismissed');
  }

  complete(input: Pick<OnboardingRecord, 'userId' | 'tenantId' | 'role'>): OnboardingRecord {
    return this.save(input, 'completed');
  }

  private save(
    input: Pick<OnboardingRecord, 'userId' | 'tenantId' | 'role'>,
    status: Exclude<OnboardingStatus, 'not_started'>,
  ): OnboardingRecord {
    const now = new Date().toISOString();
    const previous = this.records.get(keyFor(input));
    const record: OnboardingRecord = {
      id: previous?.id ?? `onboarding_${randomUUID()}`,
      userId: input.userId,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      role: input.role,
      status,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      ...(status === 'completed' ? { completedAt: now } : {}),
    };
    this.records.set(keyFor(input), structuredClone(record));
    return structuredClone(record);
  }
}
