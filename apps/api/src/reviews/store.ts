import type {
  AuditResult,
  HumanReviewFeedbackType,
  HumanReviewTicket,
  HumanReviewStatus,
  JobPostingInput,
  RuleImprovementSuggestion,
  SubmitHumanReviewDecisionInput,
} from '@job-compliance/shared';
import { redactJson, redactSensitiveText } from '@job-compliance/database';

export interface CreateRuleSuggestionInput {
  reviewTicketId: string;
  createdBy: string;
  feedbackType?: HumanReviewFeedbackType;
  category?: RuleImprovementSuggestion['category'];
  ruleId?: string;
  title?: string;
  description?: string;
}

export interface ResolveRuleSuggestionInput {
  resolvedBy: string;
  resolutionComment?: string;
}

/** Storage contract for human review tickets and feedback. */
export interface HumanReviewStore {
  /** Creates or returns the ticket derived from a MANUAL_REVIEW audit run. */
  createFromAuditResult(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): Promise<HumanReviewTicket | undefined> | HumanReviewTicket | undefined;
  /** Finds a ticket by id. */
  findById(id: string): Promise<HumanReviewTicket | undefined> | HumanReviewTicket | undefined;
  /** Lists tickets by optional status and tenant. */
  list(options?: {
    status?: HumanReviewStatus | 'all';
    tenantId?: string;
  }): Promise<HumanReviewTicket[]> | HumanReviewTicket[];
  /** Saves human feedback and returns the updated ticket. */
  submitDecision(
    id: string,
    input: SubmitHumanReviewDecisionInput,
  ): Promise<HumanReviewTicket | undefined> | HumanReviewTicket | undefined;
  /** Creates a rule improvement suggestion from a review ticket. */
  createRuleSuggestion(
    input: CreateRuleSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> | RuleImprovementSuggestion | undefined;
  /** Lists rule improvement suggestions. */
  listRuleSuggestions(options?: {
    status?: RuleImprovementSuggestion['status'] | 'all';
    tenantId?: string;
  }): Promise<RuleImprovementSuggestion[]> | RuleImprovementSuggestion[];
  /** Resolves a rule improvement suggestion. */
  resolveRuleSuggestion(
    id: string,
    input: ResolveRuleSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> | RuleImprovementSuggestion | undefined;
  /** Clears process-local state for tests. */
  clear(): Promise<void> | void;
  /** Releases resources owned by the store. */
  close?(): Promise<void>;
}

/** Process-local review storage used when no DATABASE_URL is configured. */
export class InMemoryHumanReviewStore implements HumanReviewStore {
  private readonly tickets = new Map<string, HumanReviewTicket>();
  private readonly suggestions = new Map<string, RuleImprovementSuggestion>();

  createFromAuditResult(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): HumanReviewTicket | undefined {
    if (result.decision !== 'MANUAL_REVIEW') return undefined;
    const existing = this.tickets.get(result.auditId);
    if (existing !== undefined) return structuredClone(existing);

    const ticket: HumanReviewTicket = {
      id: result.auditId,
      auditRunId: result.auditId,
      tenantId: result.context.tenantId,
      status: 'pending',
      findings: structuredClone(result.findings),
      riskLevel: result.riskLevel,
      suggestedAction: result.decision,
      agentDecision: result.decision,
      summary: result.summary,
      ...(jobPosting === undefined ? {} : { jobPosting: redactJson(jobPosting) }),
      auditResult: structuredClone(result),
      createdAt: result.createdAt,
    };
    const redactedTicket = redactJson(ticket);
    this.tickets.set(redactedTicket.id, structuredClone(redactedTicket));
    return structuredClone(redactedTicket);
  }

  findById(id: string): HumanReviewTicket | undefined {
    const ticket = this.tickets.get(id);
    return ticket === undefined ? undefined : structuredClone(ticket);
  }

  list(
    options: { status?: HumanReviewStatus | 'all'; tenantId?: string } = {},
  ): HumanReviewTicket[] {
    const status = options.status ?? 'pending';
    return [...this.tickets.values()]
      .filter((ticket) => status === 'all' || ticket.status === status)
      .filter((ticket) => options.tenantId === undefined || ticket.tenantId === options.tenantId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((ticket) => structuredClone(ticket));
  }

  submitDecision(id: string, input: SubmitHumanReviewDecisionInput): HumanReviewTicket | undefined {
    const ticket = this.tickets.get(id);
    if (ticket === undefined) return undefined;
    const updated: HumanReviewTicket = {
      ...ticket,
      status: 'completed',
      feedback: {
        id: `feedback_${Date.now()}`,
        reviewerId: input.reviewerId,
        agentDecision: ticket.agentDecision,
        finalDecision: input.finalDecision,
        feedbackType: input.feedbackType,
        comment: redactSensitiveText(input.comment),
        falsePositive: input.falsePositive,
        falseNegative: input.falseNegative,
        createdAt: new Date().toISOString(),
      },
    };
    const redactedUpdated = redactJson(updated);
    this.tickets.set(id, structuredClone(redactedUpdated));
    return structuredClone(redactedUpdated);
  }

  createRuleSuggestion(input: CreateRuleSuggestionInput): RuleImprovementSuggestion | undefined {
    const ticket = this.tickets.get(input.reviewTicketId);
    if (ticket === undefined) return undefined;
    const firstFinding = ticket.findings[0];
    const category = input.category ?? firstFinding?.category;
    const ruleId = input.ruleId ?? firstFinding?.ruleId;
    const now = new Date().toISOString();
    const suggestion: RuleImprovementSuggestion = {
      id: `rule_suggestion_${Date.now()}`,
      reviewTicketId: ticket.id,
      auditRunId: ticket.auditRunId,
      tenantId: ticket.tenantId,
      feedbackType: input.feedbackType ?? ticket.feedback?.feedbackType ?? 'VALID_RESULT',
      ...(category === undefined ? {} : { category }),
      ...(ruleId === undefined ? {} : { ruleId }),
      title: redactSensitiveText(input.title ?? `Review ${ticket.id} rule improvement`),
      description: redactSensitiveText(
        input.description ?? ticket.feedback?.comment ?? ticket.summary,
      ),
      status: 'open',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    this.suggestions.set(suggestion.id, structuredClone(suggestion));
    return structuredClone(suggestion);
  }

  listRuleSuggestions(
    options: { status?: RuleImprovementSuggestion['status'] | 'all'; tenantId?: string } = {},
  ): RuleImprovementSuggestion[] {
    const status = options.status ?? 'open';
    return [...this.suggestions.values()]
      .filter((suggestion) => status === 'all' || suggestion.status === status)
      .filter(
        (suggestion) => options.tenantId === undefined || suggestion.tenantId === options.tenantId,
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map((suggestion) => structuredClone(suggestion));
  }

  resolveRuleSuggestion(
    id: string,
    input: ResolveRuleSuggestionInput,
  ): RuleImprovementSuggestion | undefined {
    const suggestion = this.suggestions.get(id);
    if (suggestion === undefined) return undefined;
    const now = new Date().toISOString();
    const updated: RuleImprovementSuggestion = {
      ...suggestion,
      status: 'resolved',
      resolvedBy: input.resolvedBy,
      ...(input.resolutionComment === undefined
        ? {}
        : { resolutionComment: redactSensitiveText(input.resolutionComment) }),
      updatedAt: now,
      resolvedAt: now,
    };
    this.suggestions.set(id, structuredClone(updated));
    return structuredClone(updated);
  }

  clear(): void {
    this.tickets.clear();
    this.suggestions.clear();
  }
}
