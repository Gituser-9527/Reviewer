import {describe,expect,it} from 'vitest';
import {decideRewriteSafety} from './rewrite-secondary-review.js';
const base={protectedFactViolations:[],ungroundedFacts:[],criticalRiskRemaining:false,highRiskRemaining:false,newHighRisk:false,semantic:'PASSED' as const,reflection:'PASSED' as const,hallucinationDetected:false};
describe('rewrite secondary review',()=>{it('only recommends when every check passes',()=>expect(decideRewriteSafety(base).decision).toBe('SAFE_TO_RECOMMEND'));it('does not treat unavailable semantic review as pass',()=>expect(decideRewriteSafety({...base,semantic:'UNAVAILABLE'}).decision).toBe('REQUIRES_HUMAN_REVIEW'));it('rejects protected fact changes',()=>expect(decideRewriteSafety({...base,protectedFactViolations:['salary']}).decision).toBe('REJECTED'));});
