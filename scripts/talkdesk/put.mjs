// Push the repo export to its live DRAFT version, safely:
//   1. back up the live version to scripts/talkdesk/.backups/
//   2. refuse unless the target is a DRAFT and its updated_utc still equals the export's
//      (the export carries the updated_utc it was pulled at, so a UI edit since then aborts)
//   3. PUT to the collection endpoint (identifiers come from the body)
//   4. read back, verify every agent's goal/instruction/routing/tools match, re-sync the export
// usage: node scripts/talkdesk/put.mjs [--file <export>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BACKUP_DIR, EXPORT_FILE, api, arg, getSystem, writeExport } from './lib.mjs';

const file = arg('file', EXPORT_FILE);
const body = JSON.parse(readFileSync(file, 'utf8'));
const { agent_system_id: id, system_version: version } = body;
if (!body.account_id) throw new Error('export is missing account_id (PUT would 400)');

const live = await getSystem(id, version);
mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
writeFileSync(`${BACKUP_DIR}/${id.slice(0, 8)}-v${version}-${stamp}.json`, JSON.stringify(live, null, 2));
console.log(`live: ${live.agent_system_name} v${version} ${live.status} updated=${live.updated_utc} (backed up)`);

if (live.status !== 'DRAFT') { console.log('ABORT: target version is not a DRAFT'); process.exit(1); }
if (live.updated_utc !== body.updated_utc) {
  console.log(`ABORT: draft changed since pull (export ${body.updated_utc}, live ${live.updated_utc}). Pull/merge first.`);
  process.exit(1);
}

await api('/agent-system', { method: 'PUT', body });
const after = await getSystem(id, version);

const fail = [];
const pick = s => JSON.stringify(s ?? null);
if (after.status !== 'DRAFT') fail.push('status is no longer DRAFT');
if (after.updated_utc === live.updated_utc) fail.push('updated_utc did not advance');
if (pick(after.security_settings) !== pick(body.security_settings)) fail.push('security_settings differ');
const liveVars = new Set(Object.values(after.variables).map(v => v.variable_name));
for (const v of Object.values(body.variables)) if (!liveVars.has(v.variable_name)) fail.push(`variable missing: ${v.variable_name}`);
for (const a of body.agents) {
  const b = after.agents.find(x => x.agent_name === a.agent_name);
  if (!b) { fail.push(`agent missing: ${a.agent_name}`); continue; }
  for (const f of ['goal', 'instruction', 'routing_condition']) if ((a[f] ?? '') !== (b[f] ?? '')) fail.push(`${a.agent_name}: ${f} differs`);
  if (pick(a.tools.map(t => t.tool_name).sort()) !== pick(b.tools.map(t => t.tool_name).sort())) fail.push(`${a.agent_name}: tools differ`);
}

writeExport(after, file);
console.log(`after: v${version} ${after.status} updated=${after.updated_utc} (export re-synced)`);
if (fail.length) { console.log('VERIFY FAILED:\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('VERIFY OK: all agents, tools, variables and security settings match');
