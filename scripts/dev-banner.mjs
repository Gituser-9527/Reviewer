/* global console, process */
const apiPort = process.env.PORT ?? '3001';

console.log('\nJob Compliance Audit Agent - local development\n');
console.log('  Web:    http://localhost:3000');
console.log(`  API:    http://localhost:${apiPort}`);
console.log(`  Health: http://localhost:${apiPort}/health`);
console.log(`  Env:    ${process.env.NODE_ENV ?? 'development'}`);
console.log('\nPostgreSQL is optional for the local MVP. Without DATABASE_URL, the API uses in-memory storage.');
console.log('For PostgreSQL persistence, run: npm run dev:infra\n');
