import type { AuditResult, PageBinding, PageLifecycle, StoredState, WebJobCapture } from './types.js';
import { isAuditResult, isCapture } from './types.js';

const key='jobComplianceCaptureState';
const current: PageLifecycle={status:'CURRENT'};

export async function loadState():Promise<StoredState|undefined>{const value=(await chrome.storage.local.get(key))[key];if(typeof value!=='object'||value===null)return undefined;const row=value as Partial<StoredState>;if(row.schemaVersion!==2||typeof row.savedAt!=='string'||!isLifecycle(row.lifecycle)||(row.capture!==undefined&&!isCapture(row.capture))||(row.result!==undefined&&!isAuditResult(row.result))){await chrome.storage.local.remove(key);return undefined;}return row as StoredState;}
export async function saveState(input:{capture?:WebJobCapture;result?:AuditResult;binding?:PageBinding;lifecycle?:PageLifecycle;error?:string}):Promise<void>{await chrome.storage.local.set({[key]:{schemaVersion:2,...input,lifecycle:input.lifecycle??current,savedAt:new Date().toISOString()}});}
export async function invalidateState(reason:Extract<PageLifecycle,{status:'STALE'}>['reason']):Promise<StoredState|undefined>{const state=await loadState();if(!state||state.lifecycle.status==='STALE')return state;const next={...state,lifecycle:{status:'STALE' as const,reason,invalidatedAt:new Date().toISOString()},savedAt:new Date().toISOString()};await chrome.storage.local.set({[key]:next});return next;}
function isLifecycle(value:unknown):value is PageLifecycle{return typeof value==='object'&&value!==null&&((value as {status?:unknown}).status==='CURRENT'||((value as {status?:unknown}).status==='STALE'&&typeof (value as {reason?:unknown}).reason==='string'&&typeof (value as {invalidatedAt?:unknown}).invalidatedAt==='string'));}
export interface DevConfig { apiBaseUrl:string; tenantId:string; accessToken:string; }
const configKey='jobComplianceDevConfig';
export async function loadConfig():Promise<DevConfig>{const v=(await chrome.storage.session.get(configKey))[configKey];if(typeof v!=='object'||v===null)return {apiBaseUrl:'',tenantId:'',accessToken:''};const r=v as Partial<DevConfig>;return {apiBaseUrl:typeof r.apiBaseUrl==='string'?r.apiBaseUrl:'',tenantId:typeof r.tenantId==='string'?r.tenantId:'',accessToken:typeof r.accessToken==='string'?r.accessToken:''};}
export async function saveConfig(config:DevConfig):Promise<void>{await chrome.storage.session.set({[configKey]:config});}
