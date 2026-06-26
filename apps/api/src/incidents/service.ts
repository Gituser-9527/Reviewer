import { randomUUID } from 'node:crypto';
import { redactSensitiveText } from '@job-compliance/database';
import type { AuditResult } from '@job-compliance/shared';

export const emergencySwitchKeys = [
  'force_manual_review',
  'disable_llm',
  'disable_auto_reject',
] as const;
export type EmergencySwitchKey = (typeof emergencySwitchKeys)[number];
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'mitigating' | 'resolved';
export type IncidentType =
  | 'false_positive_spike'
  | 'false_negative'
  | 'system_error'
  | 'llm_failure'
  | 'rag_bad_citation'
  | 'data_leak'
  | 'rule_regression'
  | 'other';

export interface EmergencyRuntimeSwitch {
  key: EmergencySwitchKey;
  enabled: boolean;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface IncidentEvent {
  id: string;
  tenantId?: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  relatedAuditRunId?: string;
  createdBy: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface IncidentAction {
  id: string;
  incidentId: string;
  actionType:
    | 'trigger_switch'
    | 'rollback_rule'
    | 'disable_llm'
    | 'force_manual_review'
    | 'notify_owner'
    | 'run_eval'
    | 'other';
  actorId: string;
  summary: string;
  createdAt: string;
}

export interface IncidentPostmortem {
  id: string;
  incidentId: string;
  rootCause: string;
  impact: string;
  timeline: string[];
  correctiveActions: string[];
  preventionActions: string[];
  createdBy: string;
  createdAt: string;
}

export interface CreateIncidentInput {
  tenantId?: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  relatedAuditRunId?: string;
  createdBy?: string;
}

export interface CreatePostmortemInput {
  rootCause: string;
  impact: string;
  timeline?: string[];
  correctiveActions?: string[];
  preventionActions?: string[];
  createdBy?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function redactedList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => redactSensitiveText(value));
}

export class IncidentResponseService {
  private readonly switches = new Map<EmergencySwitchKey, EmergencyRuntimeSwitch>();
  private readonly incidents = new Map<string, IncidentEvent>();
  private readonly actions = new Map<string, IncidentAction>();
  private readonly postmortems = new Map<string, IncidentPostmortem>();

  constructor() {
    for (const key of emergencySwitchKeys) {
      this.switches.set(key, {
        key,
        enabled: false,
        updatedBy: 'system',
        updatedAt: nowIso(),
      });
    }
  }

  listSwitches(): EmergencyRuntimeSwitch[] {
    return emergencySwitchKeys.map((key) => clone(this.switches.get(key)!));
  }

  getSwitch(key: EmergencySwitchKey): EmergencyRuntimeSwitch {
    return clone(this.switches.get(key)!);
  }

  updateSwitch(input: {
    key: EmergencySwitchKey;
    enabled: boolean;
    reason?: string;
    updatedBy?: string;
  }): EmergencyRuntimeSwitch {
    const updated: EmergencyRuntimeSwitch = {
      key: input.key,
      enabled: input.enabled,
      ...(input.reason === undefined ? {} : { reason: redactSensitiveText(input.reason) }),
      updatedBy: input.updatedBy ?? 'incident_commander',
      updatedAt: nowIso(),
    };
    this.switches.set(input.key, clone(updated));
    return clone(updated);
  }

  activeSwitchMap(): Record<EmergencySwitchKey, boolean> {
    return {
      force_manual_review: this.getSwitch('force_manual_review').enabled,
      disable_llm: this.getSwitch('disable_llm').enabled,
      disable_auto_reject: this.getSwitch('disable_auto_reject').enabled,
    };
  }

  applyAuditSwitches(result: AuditResult): AuditResult {
    const switches = this.activeSwitchMap();
    let next = clone(result);
    if (switches.disable_llm) {
      next = {
        ...next,
        context: {
          ...next.context,
          modelVersion: 'llm-disabled-by-emergency-switch',
        },
        summary: `${next.summary} 应急开关已禁用 LLM，当前结果按规则引擎路径降级输出。`,
      };
    }
    if (switches.force_manual_review || (switches.disable_auto_reject && next.decision === 'REJECT')) {
      next = {
        ...next,
        decision: 'MANUAL_REVIEW',
        summary: switches.force_manual_review
          ? `${next.summary} 应急开关 force_manual_review 已开启，最终处置降级为人工复核。`
          : `${next.summary} 应急开关 disable_auto_reject 已开启，自动拦截已暂停，最终处置降级为人工复核。`,
        suggestions: [
          ...next.suggestions,
          switches.force_manual_review
            ? '当前处于应急强制人工复核模式，请由人工审核员确认后处理。'
            : '当前自动拦截已暂停，请人工确认后处理。',
        ],
      };
    }
    return next;
  }

  createIncident(input: CreateIncidentInput): IncidentEvent {
    const incident: IncidentEvent = {
      id: `incident_${randomUUID()}`,
      ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      incidentType: input.incidentType,
      severity: input.severity,
      status: 'open',
      title: redactSensitiveText(input.title),
      description: redactSensitiveText(input.description),
      ...(input.relatedAuditRunId === undefined ? {} : { relatedAuditRunId: input.relatedAuditRunId }),
      createdBy: input.createdBy ?? 'incident_commander',
      createdAt: nowIso(),
    };
    this.incidents.set(incident.id, clone(incident));
    return clone(incident);
  }

  listIncidents(options: { tenantId?: string; status?: IncidentStatus | 'all' } = {}): IncidentEvent[] {
    const status = options.status ?? 'all';
    return [...this.incidents.values()]
      .filter((incident) => options.tenantId === undefined || incident.tenantId === options.tenantId)
      .filter((incident) => status === 'all' || incident.status === status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  findIncident(id: string): IncidentEvent | undefined {
    const incident = this.incidents.get(id);
    return incident === undefined ? undefined : clone(incident);
  }

  recordAction(input: {
    incidentId: string;
    actionType: IncidentAction['actionType'];
    actorId: string;
    summary: string;
  }): IncidentAction | undefined {
    if (!this.incidents.has(input.incidentId)) return undefined;
    const action: IncidentAction = {
      id: `incident_action_${randomUUID()}`,
      incidentId: input.incidentId,
      actionType: input.actionType,
      actorId: input.actorId,
      summary: redactSensitiveText(input.summary),
      createdAt: nowIso(),
    };
    this.actions.set(action.id, clone(action));
    return clone(action);
  }

  listActions(incidentId: string): IncidentAction[] {
    return [...this.actions.values()]
      .filter((action) => action.incidentId === incidentId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  createPostmortem(incidentId: string, input: CreatePostmortemInput): IncidentPostmortem | undefined {
    const incident = this.incidents.get(incidentId);
    if (incident === undefined) return undefined;
    const postmortem: IncidentPostmortem = {
      id: `incident_postmortem_${randomUUID()}`,
      incidentId,
      rootCause: redactSensitiveText(input.rootCause),
      impact: redactSensitiveText(input.impact),
      timeline: redactedList(input.timeline),
      correctiveActions: redactedList(input.correctiveActions),
      preventionActions: redactedList(input.preventionActions),
      createdBy: input.createdBy ?? 'incident_commander',
      createdAt: nowIso(),
    };
    this.postmortems.set(postmortem.id, clone(postmortem));
    this.incidents.set(incidentId, {
      ...incident,
      status: 'resolved',
      resolvedAt: nowIso(),
    });
    return clone(postmortem);
  }

  findPostmortem(incidentId: string): IncidentPostmortem | undefined {
    const postmortem = [...this.postmortems.values()].find((entry) => entry.incidentId === incidentId);
    return postmortem === undefined ? undefined : clone(postmortem);
  }

  runRuleRollbackDrill(input: { actorId?: string; ruleVersion?: string }): {
    incident: IncidentEvent;
    action: IncidentAction;
    postmortem: IncidentPostmortem;
  } {
    const incident = this.createIncident({
      incidentType: 'rule_regression',
      severity: 'medium',
      title: '规则回滚演练',
      description: `演练回滚到 ${input.ruleVersion ?? 'previous-published-version'}，验证应急流程可执行。`,
      createdBy: input.actorId ?? 'drill_operator',
    });
    const action = this.recordAction({
      incidentId: incident.id,
      actionType: 'rollback_rule',
      actorId: input.actorId ?? 'drill_operator',
      summary: `已完成规则回滚演练：${input.ruleVersion ?? 'previous-published-version'}。`,
    })!;
    const postmortem = this.createPostmortem(incident.id, {
      rootCause: '演练场景，无真实事故。',
      impact: '无生产影响。',
      timeline: ['创建演练事故', '记录回滚动作', '生成复盘报告'],
      correctiveActions: ['确认回滚接口和负责人可用'],
      preventionActions: ['每次规则发布前保留上一稳定版本'],
      createdBy: input.actorId ?? 'drill_operator',
    })!;
    return { incident, action, postmortem };
  }
}
