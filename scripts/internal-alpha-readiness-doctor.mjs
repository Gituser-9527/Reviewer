#!/usr/bin/env node
import { Console } from 'node:console';
import process from 'node:process';
import { createReadinessDoctor, summarize } from './internal-alpha-doctor-lib.mjs';

const console = new Console({ stdout: process.stdout, stderr: process.stderr });
const rows = createReadinessDoctor();
for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name}: ${row.detail}`);
const summary = summarize(rows);
console.log(`Summary: ${summary.failed} FAIL, ${summary.warned} WARN`);
process.exitCode = summary.exitCode;
