// Pull a live agent-system version into the repo export (overwrites local edits).
// usage: node scripts/talkdesk/pull.mjs [--id <system id>] [--version <n>] [--out <file>]
import { DEFAULT_SYSTEM_ID, DEFAULT_VERSION, EXPORT_FILE, arg, getSystem, writeExport } from './lib.mjs';

const id = arg('id', DEFAULT_SYSTEM_ID);
const version = Number(arg('version', DEFAULT_VERSION));
const out = arg('out', EXPORT_FILE);

const sys = await getSystem(id, version);
writeExport(sys, out);
console.log(`pulled ${sys.agent_system_name} v${sys.system_version} ${sys.status} updated=${sys.updated_utc} -> ${out}`);
for (const a of sys.agents) {
  console.log(`  ${a.role.padEnd(18)} ${a.agent_name.padEnd(20)} ${String(a.instruction.length).padStart(6)} chars | ${a.tools.map(t => t.tool_name).join(', ')}`);
}
