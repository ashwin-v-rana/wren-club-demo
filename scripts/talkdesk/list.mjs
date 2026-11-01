// List agent systems on the account.
// usage: node scripts/talkdesk/list.mjs [--match <regex>]   (default: this project's system)
import { api, DEFAULT_SYSTEM_ID } from './lib.mjs';

const match = process.argv.includes('--match') ? new RegExp(process.argv[process.argv.indexOf('--match') + 1], 'i') : null;
const all = await api('/agent-systems');
const rows = all.filter(s => (match ? match.test(s.agent_system_name) : s.agent_system_id === DEFAULT_SYSTEM_ID));
rows.sort((a, b) => a.agent_system_name.localeCompare(b.agent_system_name) || a.system_version - b.system_version);
for (const s of rows) {
  console.log(`${s.agent_system_id} | ${s.agent_system_name} | v${s.system_version} ${s.status} | updated ${s.updated_utc}`);
}
console.log(`${rows.length} of ${all.length} entries`);
