// Publish the repo export's DRAFT version (same call as the ai-agents-deployments toolkit).
// Refuses unless the live draft's updated_utc still equals the export's, so a UI edit made
// since our last API save can never be published by accident.
// usage: node scripts/talkdesk/publish.mjs [--file <export>] [--desc "<version description>"]
import { readFileSync } from 'node:fs';
import { EXPORT_FILE, api, arg, getSystem } from './lib.mjs';

const exp = JSON.parse(readFileSync(arg('file', EXPORT_FILE), 'utf8'));
const { agent_system_id: id, system_version: version, account_id } = exp;
const live = await getSystem(id, version);
if (live.status !== 'DRAFT') { console.log(`ABORT: v${version} is ${live.status}, not a DRAFT`); process.exit(1); }
if (live.updated_utc !== exp.updated_utc) {
  console.log(`ABORT: draft changed since our last save (export ${exp.updated_utc}, live ${live.updated_utc}). Pull and review first.`);
  process.exit(1);
}
const res = await api('/agent-system/publish', {
  method: 'POST',
  body: { account_id, agent_system_id: id, system_version: version, version_desc: arg('desc', null) },
});
console.log('publish response:', JSON.stringify(res));
const after = await getSystem(id, version);
console.log(`v${version} is now ${after.status}`);
