import type { AuditRunRepository } from '@job-compliance/database';
import type {
  AuditResult,
  HumanReviewTicket,
  JobPostingInput,
  RuleImprovementSuggestion,
  SubmitHumanReviewDecisionInput,
} from '@job-compliance/shared';
import type {
  CreateRuleSuggestionInput,
  HumanReviewStore,
  ResolveRuleSuggestionInput,
} from './store.js';

/** Human review store backed by the database repository. */
export class DatabaseHumanReviewStore implements HumanReviewStore {
  constructor(private readonly repository: AuditRunRepository) {}

  async createFromAuditResult(
    result: AuditResult,
    jobPosting?: JobPostingInput,
  ): Promise<HumanReviewTicket | undefined> {
    return this.repository.createHumanReviewTicket(result, jobPosting);
  }

  async findById(id: string): Promise<HumanReviewTicket | undefined> {
    return this.repository.findHumanReviewTicketById(id);
  }

  async list(options: Parameters<HumanReviewStore['list']>[0] = {}): Promise<HumanReviewTicket[]> {
    return this.repository.listHumanReviewTickets(options);
  }

  async submitDecision(
    id: string,
    input: SubmitHumanReviewDecisionInput,
  ): Promise<HumanReviewTicket | undefined> {
    return this.repository.submitHumanReviewDecision(id, input);
  }

  async createRuleSuggestion(
    input: CreateRuleSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> {
    return this.repository.createRuleImprovementSuggestion(input);
  }

  async listRuleSuggestions(
    options: Parameters<HumanReviewStore['listRuleSuggestions']>[0] = {},
  ): Promise<RuleImprovementSuggestion[]> {
    return this.repository.listRuleImprovementSuggestions(options);
  }

  async resolveRuleSuggestion(
    id: string,
    input: ResolveRuleSuggestionInput,
  ): Promise<RuleImprovementSuggestion | undefined> {
    return this.repository.resolveRuleImprovementSuggestion(id, input);
  }

  clear(): void {
    return undefined;
  }
}
