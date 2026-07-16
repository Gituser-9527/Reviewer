import { describe,expect,it } from 'vitest';
import { buildApp } from '../app.js';
describe('enrichment query api',()=>{it('requires tenant context when persistence is unavailable',async()=>{const app=buildApp();const response=await app.inject({method:'GET',url:'/api/audit/runs/a/enrichment',headers:{'x-user-role':'TENANT_ADMIN','x-tenant-id':'t'}});expect(response.statusCode).toBe(400);await app.close();});});
