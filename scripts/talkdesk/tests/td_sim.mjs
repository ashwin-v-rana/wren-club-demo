// Scripted customer for the Talkdesk simulator - Wren hotel + members' club.
// Ported from ~/hospitality_restaurants/scripts/talkdesk/tests/td_sim.mjs (itself from Crestline).
// Kept: token cache, /chat/context + simulator WebSocket protocol, sent_pin read from the
// send_one_time_pin output, phone scrubbing. Changed: Wren system id, profile lookup in the
// Wren Supabase project (profiles.phone), hotel scenarios and answer keywords.
//
// Usage: node td_sim.mjs <isDraft true|false> <outJson> <scenario>
//        node td_sim.mjs --token          (warm the token cache)
// Scenarios: room_book | service | room_cancel | room_view | room_change | spa_book | spa_cancel |
//            club | large_party | long_stay | person | kb_gap | lockout | probe:<first message>
// Env (environment or repo-root .env.local): TD_TEST_PROFILE (REQUIRED, a profile whose phone
// and email are YOURS), TD_SYSTEM_ID (default Wren), TD_ROOM_DAYS (default 7), TD_SPA_DAYS (default 3).
//
// REAL TOOLS: runs that reach sign-in send a real SMS code to the test profile's phone;
// write scenarios create/cancel real bookings and send real email + SMS. Scenarios that
// change an existing record only say yes to a read-back naming their own test date.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const [isDraftArg, outJson, scenario] = process.argv.slice(2);
if (isDraftArg !== '--token' && !scenario) { console.error('usage: node td_sim.mjs <true|false> <out.json> <scenario>'); process.exit(2); }

// Talkdesk creds live in the repo-root .env.local; Supabase creds in console/.env.local.
const env = {};
for (const f of ['.env.local', 'console/.env.local']) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const SYSTEM_ID = process.env.TD_SYSTEM_ID || 'c66f7a06-2b57-4cd4-b84f-bec684881ce9'; // Wren_Hotel_Members_Club_Demo
const ACCOUNT = '68668a003d12ae2f90ebbcb4';
const API = 'https://api.talkdeskapp.com';
const ORIGIN = 'https://partner-team1.mytalkdesk.com';
const WS_BASE = 'wss://ai-agent-platform.talkdeskapp.com';
// No default: a fresh clone must never text someone else's phone.
const PROFILE = process.env.TD_TEST_PROFILE || env.TD_TEST_PROFILE;
if (!PROFILE && isDraftArg !== '--token') { console.error('Set TD_TEST_PROFILE (in .env.local or the environment) to a profile_id whose phone and email are yours.'); process.exit(2); }

// ---- test dates (Europe/London) -------------------------------------------------------------
const londonParts = (plusDays) => {
  const d = new Date(Date.now() + plusDays * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { iso: d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }), text: `${p.weekday} ${p.day} ${p.month}`, day: p.day, month: p.month };
};
// Matches "9 November", "November 9", "9th Nov" ...
const dateRe = (d) => new RegExp(`(\\b${d.month.slice(0, 3)}[a-z]*\\.?\\s+${d.day}(st|nd|rd|th)?\\b)|(\\b${d.day}(st|nd|rd|th)?\\s+(of\\s+)?${d.month.slice(0, 3)})`, 'i');
const ROOM = londonParts(Number(process.env.TD_ROOM_DAYS || 7));
const SPA = londonParts(Number(process.env.TD_SPA_DAYS || 3));
const TEST_DATE = scenario?.startsWith('spa') ? SPA : ROOM;
const TEST_RE = dateRe(TEST_DATE);

const OPENERS = {
  room_book: `I'd like to book a room for 2 guests, arriving ${ROOM.text}, for 1 night.`,
  service: 'Could I have some extra towels in my room, please?',
  room_cancel: 'I need to cancel my room booking.',
  room_view: 'Can you check my room booking for me?',
  room_change: 'I need to change the dates of my room booking.',
  spa_book: `I'd like to book a Swedish massage on ${SPA.text}.`,
  spa_cancel: 'I need to cancel my spa appointment.',
  club: 'Can I use the rooftop pool tomorrow?',
  large_party: `I'd like to book a room for 6 guests, arriving ${ROOM.text}, for 2 nights.`,
  long_stay: `I'd like to book a room for 2 guests, arriving ${ROOM.text}, for 10 nights.`,
  person: 'Can I speak to a real person please?',
  kb_gap: 'Do you have a helipad on the roof for my helicopter?',
  lockout: 'Can you check my room booking for me?',
};
// Scenarios that touch an existing record only say yes to their own test date.
const TOUCH_ONLY_TEST = ['room_cancel', 'spa_cancel'].includes(scenario);

// One token per ~45 min, cached in tests/.tok (mode 600, gitignored): parallel runs each
// asking for a token get HTTP 429 from the token endpoint.
const TOK = resolve(HERE, '.tok');
async function token() {
  if (existsSync(TOK) && Date.now() - statSync(TOK).mtimeMs < 45 * 60e3) return readFileSync(TOK, 'utf8').trim();
  const basic = Buffer.from(`${env.TALKDESK_CLIENT_ID}:${env.TALKDESK_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://partner-team1.talkdeskid.com/oauth/token', {
    method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`token failed ${r.status}`);
  writeFileSync(TOK, b.access_token, { mode: 0o600 });
  return b.access_token;
}

async function db(path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status} on ${path.split('?')[0]}`);
  return r.json();
}
async function profilePhone() {
  const rows = await db(`profiles?profile_id=eq.${PROFILE}&select=phone`);
  if (!rows[0]?.phone) throw new Error(`no phone for ${PROFILE}`);
  return rows[0].phone;
}
// A chain starts clean: a leftover test record would make the cancel step pick the wrong one.
async function leftovers() {
  if (scenario === 'room_book') return (await db(`reservations?profile_id=eq.${PROFILE}&arrival_date=eq.${ROOM.iso}&reservation_status=eq.Reserved&select=reservation_id`)).length;
  if (scenario === 'spa_book') return (await db(`activity_bookings?profile_id=eq.${PROFILE}&booking_date=eq.${SPA.iso}&status=eq.Booked&select=activity_booking_id`)).length;
  return 0;
}

const records = [];
const transcript = [];
const wrongCodes = ['111111', '222222', '333333', '444444'];
let PHONE;
let lastCode = null;

function sentPin() {
  let pin = null;
  for (const r of records) {
    const te = r.tool_execution;
    if (te && te.tool && te.tool.tool_name === 'send_one_time_pin') {
      const m = JSON.stringify(te).match(/sent_pin\W+(\d{6})/);
      if (m) pin = m[1];
    }
  }
  return pin;
}

// A choice among options: the line / item that is our test record, else the first option.
function pickOption(agent) {
  const lines = agent.split(/\n|;\s+|,\s+and\s+|\band\s+(?=\d{1,2}\s+[A-Z])/).map(s => s.trim()).filter(Boolean);
  if (TOUCH_ONLY_TEST) {
    const hit = lines.find(l => TEST_RE.test(l));
    if (!hit) return 'None of those, thanks.';
    const n = hit.match(/^\s*(\d+)\./);
    return n ? n[1] : `The one on ${TEST_DATE.day} ${TEST_DATE.month}, please.`;
  }
  const room = agent.match(/([A-Z][A-Za-z' ]+?)\s+-\s+\d+(\.\d+)?\s+pounds a night/);
  if (room) return `The ${room[1].trim()}, please.`;
  const time = agent.match(/\b(\d{1,2}(:\d{2})?\s*[AP]M)\b/i);
  if (time) return `${time[1]}, please.`;
  return null;
}

// The customer's next message, or null to stop.
function nextUserMessage(agent) {
  const a = agent.toLowerCase();
  // "<result>. Is there anything else I can help with?" with no other question = request done.
  const head = a.replace(/(is there )?anything else[^?]*\?\s*$/, '');
  if (head !== a && !head.includes('?')) return "No, that's all. Thank you!";
  // The code question is checked before the phone question: "a code sent to the mobile number on your profile".
  if (/code/.test(a) && /(enter|received|six-digit|6-digit|didn't match|did not match|say)/.test(a)) {
    if (scenario === 'lockout') return (lastCode = wrongCodes.shift()) || null;
    const pin = sentPin();
    return pin ? pin.slice(0, 3) + ' ' + pin.slice(3) : null;
  }
  if (/(mobile|phone) number/.test(a)) return PHONE;
  // Limit scenarios must hand off; any other question means the agent did not, so the run stops there.
  if (['large_party', 'long_stay'].includes(scenario)) return /connect you/.test(a) && /\?\s*$/.test(a) ? 'Yes, please connect me.' : null;
  if (/room booking, or a spa appointment/.test(a)) return scenario.startsWith('spa') ? 'A spa appointment.' : 'My room booking.';
  if (/connect you with a colleague|speak (to|with) (a|one of)|would you like me to (connect|put you through)/.test(a) && /\?\s*$/.test(a)) {
    return scenario === 'kb_gap' ? 'Yes please.' : 'No, thanks.';
  }
  // Read-backs before a write.
  if (/(shall i|should i|go ahead|would you like me to apply|confirm the booking)/.test(a) && /\?\s*$/.test(a)) {
    if (TOUCH_ONLY_TEST && !TEST_RE.test(agent)) return 'No, not that one.';
    return 'Yes, please go ahead.';
  }
  if (/would you like to book that again/.test(a)) return 'Something else - a Swedish massage, please.';
  if (/(which|what) (one|would you like|time|room)|which would you like/.test(a)) return pickOption(agent);
  if (/what date|which date|which day|when would you like/.test(a)) return TEST_DATE.text;
  if (/how many/.test(a)) return scenario === 'large_party' ? '6' : '2';
  if (/how many nights|departure/.test(a)) return '1 night.';
  return null;
}

function waitForAgent(ws, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeListener('message', onMsg); reject(new Error('timeout')); }, timeoutMs);
    function onMsg(data) {
      let r;
      try { r = JSON.parse(data.toString()); } catch { return; }
      for (const rec of r.records || []) records.push(rec);
      const agentMsg = (r.records || []).some(x => x.record_type === 'MESSAGE' && x.message && x.message.to === 'USER' && !x.message.is_filler);
      const exit = (r.records || []).some(x => x.exit);
      if (agentMsg || exit || r.agent_text || r.exit || r.end_connection_reason) {
        clearTimeout(timer); ws.removeListener('message', onMsg); resolve(r);
      }
    }
    ws.on('message', onMsg);
  });
}

const agentText = (r) => (r.records || []).filter(x => x.record_type === 'MESSAGE' && x.message && x.message.to === 'USER' && !x.message.is_filler)
  .map(x => x.message.msg).join('\n') || r.agent_text || '';

function exitOf(r) {
  const rec = (r.records || []).find(x => x.exit);
  return (rec && { ...rec.exit, llm_action: rec.llm_action, by: rec.message?.from_agent?.name }) || r.exit || r.end_connection_reason || null;
}

(async () => {
  const tok = await token();
  if (isDraftArg === '--token') { console.log('token ready'); return; }
  PHONE = await profilePhone();
  if ((await leftovers()) > 0) {
    console.log(`[${scenario}] ABORT: ${PROFILE} already has an open test record on ${TEST_DATE.text}; cancel it first`); process.exit(3);
  }
  const sessionId = randomUUID();
  const interactionId = randomUUID().replace(/-/g, '');
  const res = await fetch(`${API}/chat/context`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({
      interaction_id: interactionId, session_id: sessionId, room_id: 'sample room_id',
      account_id: ACCOUNT, agent_system_id: SYSTEM_ID,
      context: { account_id: ACCOUNT, interaction_id: interactionId, channelType: 'digital', channelName: 'SIMULATOR', callerId: '123456789', businessHours: '' },
      is_draft: isDraftArg === 'true',
    }),
  });
  console.log(`[${scenario}] context ${res.status} interaction=${interactionId} draft=${isDraftArg}`);
  if (!res.ok) { console.log((await res.text()).slice(0, 300)); process.exit(1); }

  const ws = new WebSocket(`${WS_BASE}/simulator?sessionId=${sessionId}`, { headers: { Origin: ORIGIN } });
  await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
  try { transcript.push({ who: 'agent', text: agentText(await waitForAgent(ws, 20000)) }); } catch { console.log('(no greeting)'); }

  const probe = scenario.startsWith('probe:');
  let text = probe ? scenario.slice(6) : OPENERS[scenario];
  if (!text) { console.log(`unknown scenario ${scenario}`); process.exit(2); }
  let exit = null;
  for (let turn = 0; text && turn < 16; turn++) {
    const p = waitForAgent(ws, 120000);
    ws.send(JSON.stringify({ id: `user-${Date.now()}`, text, sender: 'user', timestamp: new Date().toISOString(),
      account_id: ACCOUNT, agent_system_id: SYSTEM_ID, interaction_id: interactionId, session_id: sessionId, room_id: 'sample room_id' }));
    const shown = text === PHONE ? '<test phone>' : /^\d{3} \d{3}$/.test(text) ? '<correct code>' : text;
    transcript.push({ who: 'user', text: shown });
    console.log(`  USER:  ${shown}`);
    let r;
    try { r = await p; } catch (e) { console.log(`  AGENT: (${e.message})`); exit = { type: 'timeout' }; break; }
    const t = agentText(r);
    exit = exitOf(r);
    transcript.push({ who: 'agent', text: t, exit });
    console.log(`  AGENT: ${t}${exit ? `  [END: ${JSON.stringify(exit)}]` : ''}`);
    if (exit || probe) break;
    text = nextUserMessage(t);
  }
  ws.close();
  // Never store the test phone or the real code in the run file.
  const pin = sentPin();
  let out = JSON.stringify({ interactionId, sessionId, systemId: SYSTEM_ID, draft: isDraftArg === 'true', scenario,
    testDate: TEST_DATE.iso, transcript, exit, records }, null, 2);
  out = out.split(PHONE).join('<test phone>').split(PHONE.slice(1)).join('<test phone>');
  if (pin && scenario !== 'lockout') out = out.split(pin).join('<correct code>');
  writeFileSync(outJson, out, { mode: 0o600 });
  console.log(`[${scenario}] saved ${records.length} records`);
})().catch(e => { console.error(String(e).slice(0, 300)); process.exit(1); });
