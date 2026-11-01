"""Build an agent-system body from a pulled draft + the prompt sources in prompts/.
Usage: python3 -I scripts/talkdesk/build_system.py <pulled draft.json> <out.json>
then:  node scripts/talkdesk/put.mjs --file <out.json>
- replaces goal / instruction / routing_condition of every agent from prompts/*.txt
  ({{REPLY}} and {{RULES}} expand to prompts/_reply_block.txt and _rules_block.txt)
- renames "Pre-Escalation Agent" -> "Escalation Agent" (same agent_id)
- verify_otp: ports the restaurant v9 lockout counter (otp_attempts, LOCKED, otp_next_step)
"""
import copy, json, os, sys, uuid, random, string

HERE = os.path.dirname(os.path.abspath(__file__))
NEW = os.path.join(HERE, 'prompts')
ACCOUNT_ID = '68668a003d12ae2f90ebbcb4'
src, out = sys.argv[1], sys.argv[2]
s = json.load(open(src))
s['account_id'] = ACCOUNT_ID

def read(name):
    return open(os.path.join(NEW, name)).read().strip()

REPLY, RULES = read('_reply_block.txt'), read('_rules_block.txt')

def compose(name):
    t = read(name).replace('{{REPLY}}', REPLY).replace('{{RULES}}', RULES)
    assert '{{' not in t, name
    return t

GOALS = {
    'Wren Orchestrator': "Concierge for The Wren Hotel & Members' Club, London: greets guests, routes each request to the right sub-agent, delivers their messages word for word, completes handoffs with transfer_to_human, and closes. Holds no business logic.",
    'Authentication Agent': "Verifies the guest with a 6-digit code sent to the mobile number on their profile. The verify_otp workflow, not the agent, counts attempts and sets authenticated and profile_id.",
    'Room Reservation Agent': "Checks live room availability and rates and makes a new room booking for a signed-in guest after an explicit yes, then emails and texts the confirmation.",
    'Room Update Agent': "Shows, cancels, or applies an accepted upgrade to a signed-in guest's existing room booking after an explicit yes; date, room or party changes go to the reservations team.",
    'Spa and Wellness Agent': "Books, shows and cancels Cowshed spa and barbershop appointments for a signed-in guest after an explicit yes, then emails and texts the confirmation.",
    'Guest Services Agent': "Logs an in-room item or service request for a signed-in guest (in-house or arriving soon) after an explicit yes, and reports the status of their requests.",
    'Club Access Agent': "Tells a signed-in guest whether they may use the rooftop pool, club and member spaces on a date, from check_club_access only.",
    'Concierge Agent': "Answers public questions about the hotel from the knowledge base only; offers a colleague when the answer is not there.",
    'Escalation Agent': "Handles every handoff to a person: picks the team, loads Transfer Data for the team member, then transfers the customer with transfer_to_human.",
}
FILES = {
    'Wren Orchestrator': 'Wren_Orchestrator.txt', 'Authentication Agent': 'Authentication_Agent.txt',
    'Room Reservation Agent': 'Room_Reservation_Agent.txt', 'Room Update Agent': 'Room_Update_Agent.txt',
    'Spa and Wellness Agent': 'Spa_and_Wellness_Agent.txt', 'Guest Services Agent': 'Guest_Services_Agent.txt',
    'Club Access Agent': 'Club_Access_Agent.txt', 'Concierge Agent': 'Concierge_Agent.txt',
    'Escalation Agent': 'Escalation_Agent.txt',
}

for a in s['agents']:
    if a['agent_name'] == 'Pre-Escalation Agent':
        a['agent_name'] = 'Escalation Agent'
    n = a['agent_name']
    a['goal'] = GOALS[n]
    a['instruction'] = compose(FILES[n])
    if n == 'Wren Orchestrator':
        a['routing_condition'] = read('Wren_Orchestrator.routing.txt')

# ---- verify_otp: lockout counter + next step (ported from the restaurant v9 workflow) ----
CODE = r'''var MAX_ATTEMPTS = 3;
var wf_entered_pin = String(Context.getVariable("entered_pin") || "").replace(/\D/g, "");
var wf_sent_pin = String(Context.getVariable("sent_pin") || "").replace(/\D/g, "");
var wf_pending_profile_id = String(Context.getVariable("pending_profile_id") || "");
var wf_attempts = parseInt(String(Context.getVariable("otp_attempts") || "0"), 10) || 0;

if (wf_attempts >= MAX_ATTEMPTS) {
    // Already locked out: never authenticate, even with the right code.
    Context.setVariable("wf_otp_result", "LOCKED");
    Context.setVariable("wf_authenticated", "false");
    Context.setVariable("wf_profile_id", "");
} else if (wf_sent_pin.length === 6 && wf_entered_pin === wf_sent_pin && wf_pending_profile_id !== "") {
    Context.setVariable("wf_otp_result", "MATCH");
    Context.setVariable("wf_authenticated", "true");
    Context.setVariable("wf_profile_id", wf_pending_profile_id);
} else {
    wf_attempts = wf_attempts + 1;
    Context.setVariable("wf_otp_result", wf_attempts >= MAX_ATTEMPTS ? "LOCKED" : "NO_MATCH");
    Context.setVariable("wf_authenticated", "false");
    Context.setVariable("wf_profile_id", "");
}
Context.setVariable("wf_otp_attempts", String(wf_attempts));

var wf_result = String(Context.getVariable("wf_otp_result") || "");
var wf_next;
if (wf_result === "MATCH") {
    wf_next = "Verified. Do not call verify_otp again. Your next action is execute_sql to log auth_success, then reply_to_coordinator with exactly: STATUS: AUTHENTICATED";
} else if (wf_result === "LOCKED") {
    wf_next = "Locked out. Do not call verify_otp or send_one_time_pin again. Your next action is execute_sql to log the lockout, then return {\"auth_result\": \"failed\", \"failure_reason\": \"max_attempts\"}.";
} else if (wf_attempts <= 1) {
    wf_next = "Wrong code. Do not call verify_otp again in this turn. Your next action is reply_to_coordinator with exactly: STATUS: NEED_INPUT | ASK_CUSTOMER: \"That code didn't match. What is the six-digit code you received? If you'd like, I can send you a new one.\"";
} else {
    wf_next = "Wrong code again. Do not call verify_otp again in this turn. Your next action is reply_to_coordinator with exactly: STATUS: NEED_INPUT | ASK_CUSTOMER: \"That code still didn't match, and you have one try left. Please check the text message and enter the six-digit code, or I can send you a new one.\"";
}
Context.setVariable("wf_otp_next_step", wf_next);'''

def nanoid(n=21):
    return ''.join(random.choice(string.ascii_letters + string.digits + '_-') for _ in range(n))

auth = next(a for a in s['agents'] if a['agent_name'] == 'Authentication Agent')
tool = next(t for t in auth['tools'] if t['tool_name'] == 'verify_otp')
ep = tool['execute_params']
by_name = {v['variable_name']: (vid, v) for vid, v in s['variables'].items()}
new_vars = {}
for name, desc in (('otp_attempts', 'Failed OTP attempts in this conversation (set by verify_otp)'),
                   ('otp_next_step', "The Authentication Agent's next action after verify_otp (set by verify_otp)")):
    if name in by_name:
        vid = by_name[name][0]
    else:
        vid = str(uuid.uuid4())
        s['variables'][vid] = {'id': vid, 'variable_name': name, 'description': desc, 'type': 'STRING', 'possible_values': [],
                               'source': 'Custom', 'references': [], 'is_read_only': False, 'is_auth_condition': False}
    ref = {'tool_id': tool['tool_id'], 'agent_id': auth['agent_id']}
    if ref not in s['variables'][vid]['references']:
        s['variables'][vid]['references'].append(ref)
    new_vars[name] = vid

for node in ep['nodes']:
    if node['type'] == 'function':
        node['data']['code'] = CODE
    if node['type'] == 'start-flow':
        node['data']['more_details'] = ('Input: entered_pin. Compares it with the PIN sent by send_one_time_pin and counts wrong codes. '
                                        'Returns otp_result = MATCH, NO_MATCH or LOCKED (3rd wrong code), otp_next_step, and sets authenticated and profile_id on MATCH.')
end = next(n for n in ep['nodes'] if n['type'] == 'end-flow')
wf_names = {v['variable_name'] for v in ep['variables']}
for name in ('otp_attempts', 'otp_next_step'):
    wf = 'wf_' + name
    if wf in wf_names:
        continue
    wid = nanoid()
    ep['variables'].append({'id': wid, 'type': 'Workflow', 'variable_name': wf})
    end['data']['variables'].append({'id': wid, 'type': '', 'variable': new_vars[name],
                                     'first_variable': {'variable': wid}, 'second_variable': {'variable': new_vars[name]}})
tmpl = tool['output_params']['otp_result']
for name, desc in (('otp_attempts', 'Failed OTP attempts so far'), ('otp_next_step', 'The exact next action for the agent')):
    p = copy.deepcopy(tmpl)
    p.update({'name': name, 'description': desc, 'variable_name': name})
    tool['output_params'][name] = p
tool['output_params']['otp_result']['description'] = 'OTP result: MATCH, NO_MATCH or LOCKED'

# ---- send_one_time_pin: the "code sent" line comes ONLY from the workflow (otp_next_step), so the
# agent cannot say a code was sent without calling the skill (Databricks: v10_full1 room_change, 2026-11-01).
SENT_LINE = ('\nContext.setVariable("wf_otp_next_step", "Code sent. Your next action is reply_to_coordinator with exactly: '
             'STATUS: NEED_INPUT | ASK_CUSTOMER: \\"I\'ve sent a six-digit code to your mobile. Please say or enter it when it arrives.\\"");\n')
send = next(t for t in auth['tools'] if t['tool_name'] == 'send_one_time_pin')
sep = send['execute_params']
gen = next(n for n in sep['nodes'] if n['type'] == 'function')
if 'wf_otp_next_step' not in gen['data']['code']:
    gen['data']['code'] = gen['data']['code'].rstrip() + SENT_LINE
if 'wf_otp_next_step' not in {v['variable_name'] for v in sep['variables']}:
    wid = nanoid()
    sep['variables'].append({'id': wid, 'type': 'Workflow', 'variable_name': 'wf_otp_next_step'})
    send_end = next(n for n in sep['nodes'] if n['type'] == 'end-flow')
    send_end['data']['variables'].append({'id': wid, 'type': '', 'variable': new_vars['otp_next_step'],
                                          'first_variable': {'variable': wid}, 'second_variable': {'variable': new_vars['otp_next_step']}})
if 'otp_next_step' not in send['output_params']:
    send['output_params']['otp_next_step'] = copy.deepcopy(tool['output_params']['otp_next_step'])
ref = {'tool_id': send['tool_id'], 'agent_id': auth['agent_id']}
if ref not in s['variables'][new_vars['otp_next_step']]['references']:
    s['variables'][new_vars['otp_next_step']]['references'].append(ref)

# ASCII only, sizes
for a in s['agents']:
    for k in ('goal', 'instruction', 'routing_condition'):
        v = a.get(k) or ''
        bad = [c for c in v if ord(c) > 126 or (ord(c) < 32 and c not in '\n\t')]
        assert not bad, (a['agent_name'], k, bad[:5])
    print(f"{a['agent_name']:<24} instr {len(a['instruction']):>6}  routing {len(a.get('routing_condition') or ''):>5}")
print('total instruction chars:', sum(len(a['instruction']) for a in s['agents']))
json.dump(s, open(out, 'w'), indent=2)
print('wrote', out)
