import type { StoredState, WebJobCapture, AuditResult } from './types.js';
import { isAuditResult,isCapture } from './types.js';
const key='jobComplianceCaptureState';
export async function loadState():Promise<StoredState|undefined>{const value=(await chrome.storage.local.get(key))[key];if(typeof value!=='object'||value===null)return undefined;const row=value as Partial<StoredState>;if(row.schemaVersion!==1||typeof row.savedAt!=='string'||(row.capture!==undefined&&!isCapture(row.capture))||(row.result!==undefined&&!isAuditResult(row.result))){await chrome.storage.local.remove(key);return undefined;}return row as StoredState;}
export async function saveState(input:{capture?:WebJobCapture;result?:AuditResult;error?:string}):Promise<void>{await chrome.storage.local.set({[key]:{schemaVersion:1,...input,savedAt:new Date().toISOString()}});}
export interface DevConfig { apiBaseUrl:string; tenantId:string; accessToken:string; }
const configKey='jobComplianceDevConfig';
export async function loadConfig():Promise<DevConfig>{const v=(await chrome.storage.session.get(configKey))[configKey];if(typeof v!=='object'||v===null)return {apiBaseUrl:'',tenantId:'',accessToken:''};const r=v as Partial<DevConfig>;return {apiBaseUrl:typeof r.apiBaseUrl==='string'?r.apiBaseUrl:'',tenantId:typeof r.tenantId==='string'?r.tenantId:'',accessToken:typeof r.accessToken==='string'?r.accessToken:''};}
export async function saveConfig(config:DevConfig):Promise<void>{await chrome.storage.session.set({[configKey]:config});}
