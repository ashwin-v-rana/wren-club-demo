// (Copied unchanged from ~/hospitality_restaurants/scripts/talkdesk/tests/td_dbx.ts.)
// Pull the LLM calls of one simulator run from Databricks with a NARROW time window.
// Reuses the ai-agents-deployments toolkit's own auth/query/shaping code; only the window
// differs: the toolkit CLI accepts whole days (YYYY-MM-DD), but its SQL compares
// kafka_timestamp, so a few minutes around the run is enough and much faster.
//
// Usage (from the toolkit dir, so its modules resolve):
//   cd ~/ai-agents-deployments/.toolkit && npx tsx <repo>/scripts/talkdesk/tests/td_dbx.ts <run.json> [outDir] [padMinutes]
// The run file's records carry timestamps; the window is first..last record +/- padMinutes (default 5).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const TK = join(homedir(), 'ai-agents-deployments/.toolkit/src/host/obs/databricks');
await import(join(homedir(), 'ai-agents-deployments/.toolkit/src/host/common/env.js')); // loads .toolkit/.env (saved tokens), as the CLI does
const { resolveEndpoint } = await import(join(TK, 'endpoints.js'));
const { buildLogsQuery, shapeRows } = await import(join(TK, 'shape.js'));
const { runFirstColumn } = await import(join(TK, 'query.js'));
const { resolveBearer } = await import(join(TK, 'auth.js'));

const [runFile, outArg, padArg] = process.argv.slice(2);
if (!runFile) { console.error('usage: td_dbx.ts <run.json> [outDir] [padMinutes]'); process.exit(2); }
const run = JSON.parse(readFileSync(runFile, 'utf8'));
const ACCOUNT = '68668a003d12ae2f90ebbcb4';
const pad = Number(padArg ?? 5) * 60e3;

// Every timestamp-looking value in the records bounds the run.
const stamps: number[] = [];
JSON.stringify(run.records, (_k, v) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) { const t = Date.parse(v.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(v) ? v : v + 'Z'); if (!isNaN(t)) stamps.push(t); }
  return v;
});
if (!stamps.length) throw new Error('no timestamps in run file; pass a day window to the toolkit CLI instead');
const fmt = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
const window = { start: fmt(Math.min(...stamps) - pad), end: fmt(Math.max(...stamps) + pad) };

const endpoint = resolveEndpoint('prd', 'us');
const { token, source } = await resolveBearer({ host: endpoint.host, env: 'prd', region: 'us', interactiveAllowed: false });
process.stderr.write(`Databricks prd/us auth: ${source}; interaction ${run.interactionId}; window ${window.start} .. ${window.end} UTC\n`);
const t0 = Date.now();
const rows = await runFirstColumn({
  host: endpoint.host, token, warehouseId: endpoint.warehouseId,
  statement: buildLogsQuery({ accountScoped: true }),
  parameters: [
    { name: 'date_start', value: window.start },
    { name: 'date_end', value: window.end },
    { name: 'interaction_id', value: run.interactionId },
    { name: 'account_id', value: ACCOUNT },
  ],
  timeoutMs: 600000,
});
const shaped = shapeRows(rows, { uniqueAgentKeys: false });
const out = outArg ?? join('.logs', basename(runFile, '.json') + '-' + run.interactionId.slice(0, 8));
mkdirSync(out, { recursive: true, mode: 0o700 });
for (const f of shaped.files) writeFileSync(join(out, f.filename), f.content, { mode: 0o600 });
process.stderr.write(`${rows.length} row(s), ${shaped.written} file(s) -> ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
