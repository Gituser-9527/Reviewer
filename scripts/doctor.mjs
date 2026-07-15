/* global console, process */
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { URL } from 'node:url';

const root = process.cwd();
const envPath = `${root}/.env`;

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return index < 0 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const fileEnv = readEnvFile(envPath);
const env = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

function probePort(host, port, timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function version(command, args) {
  try {
    const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
    return execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return undefined;
  }
}

const checks = [];
function addCheck(label, status, detail) {
  checks.push({ label, status, detail });
}

const nodeVersion = process.version;
const nodeMajor = Number(nodeVersion.replace(/^v/u, '').split('.')[0]);
addCheck('Node.js', nodeMajor >= 20 ? 'ok' : 'error', `${nodeVersion}; requires >= v20`);
const npmVersion =
  process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/u)?.[1] ?? version('npm', ['--version']);
addCheck('npm', npmVersion === undefined ? 'error' : 'ok', npmVersion ?? 'not found');
addCheck('.env', existsSync(envPath) ? 'ok' : 'info', existsSync(envPath) ? 'loaded from .env' : 'not found; defaults and .env.example are used');

const apiPort = Number(env('PORT', '3001'));
const webPort = 3000;
const apiActive = await probePort('127.0.0.1', apiPort);
const webActive = await probePort('127.0.0.1', webPort);
addCheck('API port', apiActive ? 'ok' : 'info', apiActive ? `http://localhost:${apiPort} is reachable` : `http://localhost:${apiPort} is not running`);
addCheck('Web port', webActive ? 'ok' : 'info', webActive ? `http://localhost:${webPort} is reachable` : `http://localhost:${webPort} is not running`);

const databaseUrl = env('DATABASE_URL', '');
if (databaseUrl === '') {
  addCheck('PostgreSQL', 'info', 'DATABASE_URL is not configured; API will use in-memory storage');
} else {
  const target = parseDatabaseUrl(databaseUrl);
  if (target === undefined) {
    addCheck('PostgreSQL', 'error', 'DATABASE_URL is not a valid URL');
  } else {
    const available = await probePort(target.host, target.port);
    addCheck('PostgreSQL', available ? 'ok' : 'warn', available ? `${target.host}:${target.port} is reachable` : `${target.host}:${target.port} is unavailable; run npm run dev:infra`);
  }
}

addCheck('Docker Compose', version('docker', ['compose', 'version']) === undefined ? 'warn' : 'ok', version('docker', ['compose', 'version']) ?? 'not found; dev:infra is unavailable');

console.log('\nJob Compliance Audit Agent local environment\n');
for (const check of checks) {
  const icon = check.status === 'ok' ? 'OK' : check.status === 'error' ? 'ERROR' : check.status === 'warn' ? 'WARN' : 'INFO';
  console.log(`[${icon}] ${check.label}: ${check.detail}`);
}
console.log('\nAddresses:');
console.log(`  Web:    http://localhost:${webPort}`);
console.log(`  API:    http://localhost:${apiPort}`);
console.log(`  Health: http://localhost:${apiPort}/health`);
console.log(`  Env:    ${env('NODE_ENV', 'development')}`);
console.log('\nStart the application with: npm run dev');

if (checks.some((check) => check.status === 'error')) process.exitCode = 1;
