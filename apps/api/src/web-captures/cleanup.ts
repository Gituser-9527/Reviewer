import { InMemoryWebCaptureStore } from './store.js';

const dryRun = process.argv.includes('--dry-run');
const tenantIndex = process.argv.indexOf('--tenant');
const tenantId = tenantIndex >= 0 ? process.argv[tenantIndex + 1] : undefined;
// The scheduled production entry point must construct the PostgreSQL store; this command remains safe in local/dev mode.
const cleaned = new InMemoryWebCaptureStore().cleanup(tenantId, dryRun);
console.log(JSON.stringify({ resource: 'web_captures', dryRun, tenantId, cleaned }));
