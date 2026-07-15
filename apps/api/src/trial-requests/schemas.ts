import { z } from 'zod';

/** Public request body for a product trial. The service redacts contact fields before storage. */
export const createTrialRequestSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  companySize: z.string().trim().min(1).max(80).optional(),
  useCase: z.string().trim().min(1).max(1000).optional(),
});

export type CreateTrialRequestInput = z.infer<typeof createTrialRequestSchema>;
