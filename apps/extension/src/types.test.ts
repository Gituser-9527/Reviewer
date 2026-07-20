import { describe,expect,it } from 'vitest';
import { isAuditResult,isCapture } from './types.js';
describe('extension runtime boundaries',()=>{it('rejects invalid capture and unknown audit decisions',()=>{expect(isCapture({schemaVersion:1,job:{title:'x'}})).toBe(false);expect(isAuditResult({auditId:'a',decision:'UNSAFE',riskLevel:'HIGH',summary:'x',findings:[],createdAt:'x'})).toBe(false);});});
