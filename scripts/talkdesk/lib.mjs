// Shared helpers for the Talkdesk multi-agent config API (Wren hotel + members' club agent system).
// Ported from ~/hospitality_restaurants/scripts/talkdesk/lib.mjs; only paths and ids changed.
// Credentials come from this repo's .env.local (TALKDESK_CLIENT_ID / TALKDESK_CLIENT_SECRET)
// and are never printed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EXPORT_FILE = resolve(ROOT, 'talkdesk/wren-ai-agent-system.json');
export const BACKUP_DIR = resolve(ROOT, 'scripts/talkdesk/.backups');
export const DEFAULT_SYSTEM_ID = 'c66f7a06-2b57-4cd4-b84f-bec684881ce9'; // Wren_Hotel_Members_Club_Demo
export const DEFAULT_VERSION = 10; // the current DRAFT; bump after every publish

const TOKEN_URL = 'https://partner-team1.talkdeskid.com/oauth/token';
const API = 'https://api.talkdeskapp.com/multi-agent/manage';
const SCOPE = 'ai-agent-platform-agents:read ai-agent-platform-agents:write';

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  for (const k of ['TALKDESK_CLIENT_ID', 'TALKDESK_CLIENT_SECRET']) {
    if (!env[k]) throw new Error(`${k} missing from .env.local`);
  }
  return env;
}

let token;
async function authHeaders() {
  if (!token) {
    const env = loadEnv();
    const basic = Buffer.from(`${env.TALKDESK_CLIENT_ID}:${env.TALKDESK_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }),
    });
    const body = await res.json();
    if (!body.access_token) throw new Error(`token request failed (${res.status}): ${body.error ?? 'no access_token'}`);
    token = body.access_token;
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, headers: await authHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const getSystem = (id, version) => api(`/agent-system/${id}/${version}`);

// The read response omits account_id; keep the export's account_id and key order.
export function writeExport(system, file = EXPORT_FILE) {
  if (!existsSync(file)) { writeFileSync(file, JSON.stringify(system, null, 2) + '\n'); return; }
  const prev = JSON.parse(readFileSync(file, 'utf8'));
  const merged = { account_id: prev.account_id, ...system };
  const ordered = Object.fromEntries(Object.keys(prev).filter(k => k in merged).map(k => [k, merged[k]]));
  for (const [k, v] of Object.entries(merged)) if (!(k in ordered)) ordered[k] = v;
  writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
