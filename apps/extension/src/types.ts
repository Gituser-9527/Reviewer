export const decisions = ['PASS','REJECT','MANUAL_REVIEW','ALLOW_WITH_WARNING','NEED_MORE_INFO'] as const;
export type AuditDecision = typeof decisions[number];
export interface CapturedJob { title:string; companyName?:string; location?:string; description:string; requirements:string[]; salary?:string; employmentType?:string; }
export interface WebJobCapture { schemaVersion:1; captureId:string; capturedAt:string; sourceUrl:string; sourcePlatform:string; pageTitle:string; extractionMethod:'json-ld'|'dom'; extractionWarnings:string[]; userCorrected:boolean; job:CapturedJob; }
export interface AuditFinding { category:string; severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; message:string; evidence:Array<{title:string;quote?:string}>; metadata?:{matchedText?:string[]}; }
export interface AuditResult { auditId:string; decision:AuditDecision; riskLevel:string; summary:string; findings:AuditFinding[]; createdAt:string; }
export interface StoredState { schemaVersion:1; capture?:WebJobCapture; result?:AuditResult; error?:string; savedAt:string; }
export interface MessageExtract { type:'EXTRACT_CURRENT_JOB'; }
export interface FindingHighlight { id:string; text:string; severity:AuditFinding['severity']; }
export interface MessageApplyFindingHighlights { type:'APPLY_FINDING_HIGHLIGHTS'; findings:FindingHighlight[]; }
export interface MessageClearFindingHighlights { type:'CLEAR_FINDING_HIGHLIGHTS'; }
export interface MessageSuccess { type:'JOB_EXTRACTION_SUCCEEDED'; capture:WebJobCapture; }
export interface MessageFailure { type:'JOB_EXTRACTION_FAILED'; code:'NO_JOB_FOUND'|'INVALID_PAGE'; }
export interface MessageHighlightsApplied { type:'FINDING_HIGHLIGHTS_APPLIED'; highlightedFindings:number; unlocatedFindings:number; matchedTextCount:number; }
export interface MessageHighlightsCleared { type:'FINDING_HIGHLIGHTS_CLEARED'; clearedCount:number; }
export interface MessageHighlightFailure { type:'FINDING_HIGHLIGHTS_FAILED'; code:'INVALID_HIGHLIGHT_REQUEST'; }
export type ExtensionMessage=MessageExtract|MessageApplyFindingHighlights|MessageClearFindingHighlights|MessageSuccess|MessageFailure|MessageHighlightsApplied|MessageHighlightsCleared|MessageHighlightFailure;
export function isCapture(value:unknown):value is WebJobCapture { if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;const j=v.job;return v.schemaVersion===1&&typeof v.captureId==='string'&&typeof v.capturedAt==='string'&&typeof v.sourceUrl==='string'&&typeof j==='object'&&j!==null&&typeof (j as Record<string,unknown>).title==='string'&&typeof (j as Record<string,unknown>).description==='string'; }
export function isAuditResult(value:unknown):value is AuditResult { if(typeof value!=='object'||value===null)return false;const v=value as Record<string,unknown>;return typeof v.auditId==='string'&&typeof v.decision==='string'&&decisions.includes(v.decision as AuditDecision)&&typeof v.riskLevel==='string'&&typeof v.summary==='string'&&Array.isArray(v.findings)&&typeof v.createdAt==='string'; }
