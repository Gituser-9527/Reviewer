import type { LLMMessage } from './types.js';

/** Supported prompt template names. */
export type PromptTemplateName =
  | 'job-facts-extraction'
  | 'risk-explanation'
  | 'compliance-rewrite'
  | 'reflection-check';

/** Variables supplied to a prompt template. */
export type PromptVariables = Record<string, string | number | boolean | null | undefined>;

/** Versioned prompt template definition. */
export interface PromptTemplate {
  /** Stable template name. */
  name: PromptTemplateName;
  /** Prompt version recorded in audit context when used. */
  version: string;
  /** System message template. */
  system: string;
  /** User message template. */
  user: string;
}

function renderText(template: string, variables: PromptVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/** Registry for versioned prompt templates. */
export class PromptTemplateRegistry {
  private readonly templates = new Map<PromptTemplateName, PromptTemplate>();

  constructor(templates: readonly PromptTemplate[] = defaultPromptTemplates) {
    for (const template of templates) {
      this.templates.set(template.name, template);
    }
  }

  /** Returns a template by name. */
  get(name: PromptTemplateName): PromptTemplate {
    const template = this.templates.get(name);
    if (template === undefined) {
      throw new Error(`Prompt template not found: ${name}`);
    }
    return template;
  }

  /** Renders a template into chat messages. */
  render(name: PromptTemplateName, variables: PromptVariables): LLMMessage[] {
    const template = this.get(name);
    return [
      {
        role: 'system',
        content: renderText(template.system, variables),
      },
      {
        role: 'user',
        content: renderText(template.user, variables),
      },
    ];
  }
}

/** Default compliance-safe templates. They assist but do not decide final audit outcomes. */
export const defaultPromptTemplates: PromptTemplate[] = [
  {
    name: 'job-facts-extraction',
    version: 'job-facts-extraction-v1',
    system:
      '你是招聘岗位信息抽取助手。只抽取结构化事实，不输出审核结论，不判断违法，不编造缺失信息。',
    user:
      '请从以下岗位文本抽取结构化事实，并只输出 JSON。岗位文本：\n{{jobText}}',
  },
  {
    name: 'risk-explanation',
    version: 'risk-explanation-v1',
    system:
      '你是招聘合规解释助手。只能基于已给出的 ruleId、finding 和 evidence 解释风险，不新增法规名称或条款。',
    user:
      '请解释以下命中项的风险和修改建议，并只输出 JSON。\nFindings:\n{{findingsJson}}\nEvidence:\n{{evidenceJson}}',
  },
  {
    name: 'compliance-rewrite',
    version: 'compliance-rewrite-v1',
    system:
      '你是招聘文案改写助手。改写时删除或弱化已命中的风险表达，不引入新的限制条件。改写结果必须再由规则引擎复查。',
    user:
      '请根据以下建议改写岗位文案，并只输出 JSON。\n岗位原文：\n{{jobText}}\n建议：\n{{suggestions}}',
  },
  {
    name: 'reflection-check',
    version: 'reflection-check-v1',
    system:
      '你是审核结果一致性检查助手。不得推翻明确规则命中，不得输出最终 decision，只指出格式、证据和表述问题。',
    user:
      '请检查以下审核结果是否存在无依据断言、绝对法律结论或缺少 ruleId/evidenceId 的高风险项，并只输出 JSON。\n{{auditResultJson}}',
  },
];

/** Default prompt registry used by future LLM-backed modules. */
export const defaultPromptRegistry = new PromptTemplateRegistry();

