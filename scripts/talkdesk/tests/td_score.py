"""Score td_sim.mjs runs for the Wren hotel + members' club system.
Ported from ~/hospitality_restaurants/scripts/talkdesk/tests/td_score.py (from Crestline):
same Orchestrator fault definitions, Wren agents / phrases / SQL-function writes.

Usage: python3 -I td_score.py <run.json> [...]
Prints per run: PASS/FAIL, why, then the agent hops and tool calls.
"""
import json, re, sys

ORCH = 'Wren Orchestrator'
AUTH = 'Authentication Agent'
ESC_RE = r'(Pre-)?Escalation Agent'
PROBE_WANT = [  # (first-message keyword, sub-agent that owns the request)
    ('cancel my room', 'Room Update Agent'), ('change the dates', 'Room Update Agent'),
    ('book a room', 'Room Reservation Agent'), ('rooftop pool', 'Club Access Agent'),
    ('massage', 'Spa and Wellness Agent'), ('pillows', 'Guest Services Agent'),
    ('what time does', 'Concierge Agent'), ('where is', 'Concierge Agent'),
    ('speak to', ESC_RE), ('person', ESC_RE),
]
# Lines the Orchestrator may write itself: greeting, room-or-spa clarifier, anything else,
# closing, restaurant deflection, handoff lines.
OWN_LINES = (r"welcome|how (may|can) I (help|assist)|room booking, or a spa appointment|anything else I can help|"
             r"restaurant reservations|thank you for contacting the wren|connect you with")
# Every committing write is one of these SQL functions (CLAUDE.md rule 4).
WRITE_RE = r'\b(post_reservation|put_reservation|cancel_reservation|accept_upgrade_offer|post_activity_booking|cancel_activity_booking|post_service_request)\s*\('
YES_RE = r'^\s*(yes|yeah|yep|please do|go ahead)'
TEAM_LINES = {
    'reservations': r'reservations team',
    'spa': r'spa team',
    'front_desk': r'front desk team',
    'human_request': r'colleague who can help',
    'identity_verification': r'verif|colleague',
}


def name(x):
    return (x or {}).get('name')


def hops(recs):
    out = []
    for r in recs:
        m, tc = r.get('message'), r.get('tool_call')
        if r['record_type'] == 'MESSAGE' and m:
            out.append(f"{name(m.get('from_agent')) or m.get('from')}->{name(m.get('to_agent')) or m.get('to')}")
        elif r['record_type'] == 'TOOL_CALL' and tc:
            out.append(f"[{(tc.get('tool') or {}).get('tool_name') or tc.get('tool_name') or r.get('llm_action')}]")
        if r.get('exit'):
            out.append(f"EXIT:{r['exit'].get('type')}/{r.get('llm_action')}")
    return out


def msgs(recs, src=None, dst=None):
    for r in recs:
        m = r.get('message')
        if r['record_type'] != 'MESSAGE' or not m:
            continue
        s, d = name(m.get('from_agent')) or m.get('from'), name(m.get('to_agent')) or m.get('to')
        if (src is None or re.fullmatch(src, s or '')) and (dst is None or re.fullmatch(dst, d or '')):
            yield s, d, m.get('msg') or '', r


def said(recs, agent, pattern):
    return any(re.search(pattern, t, re.I) for _, _, t, _ in msgs(recs, src=agent))


def tools(recs):
    return [(tc.get('tool') or {}).get('tool_name') or tc.get('tool_name') for r in recs
            if r['record_type'] == 'TOOL_CALL' and (tc := r.get('tool_call'))]


def writes(recs):
    """(index, function) for every committing SQL-function call."""
    out = []
    for i, r in enumerate(recs):
        if r['record_type'] == 'TOOL_CALL' and r.get('tool_call'):
            m = re.search(WRITE_RE, json.dumps(r['tool_call']), re.I)
            if m:
                out.append((i, m.group(1).lower()))
    return out


def relay_faults(recs):
    """Orchestrator faults any scenario can hit (Crestline definitions):
    answered_for_customer, list_dropped, skipped_escalation, own_question,
    code_dropped (a WRENLON- confirmation the sub-agent gave did not reach the customer)."""
    faults, pending, escalate_due = [], None, False
    for s, d, msg, r in msgs(recs):
        if s not in (ORCH, 'USER') and d == ORCH:
            pending = msg
            escalate_due = bool(re.search(r'"status":\s*"escalate"|STATUS:\s*TRANSFER', msg))
        elif s == ORCH and d == 'USER':
            if escalate_due and not r.get('exit'):
                faults.append('skipped_escalation')
            escalate_due = False
            if pending and any(code not in msg for code in re.findall(r'WRENLON-[A-Z0-9]{5}', pending)):
                faults.append('code_dropped')
            if pending and len(re.findall(r'^\s*\d+\.', pending, re.M)) >= 2 and len(re.findall(r'^\s*\d+\.', msg, re.M)) < 2:
                faults.append('list_dropped')
            if not pending and not re.search(OWN_LINES, msg, re.I) and '?' in msg:
                faults.append('own_question')
            pending = None
        elif s == ORCH and d not in ('USER', ORCH) and pending and '?' in pending \
                and (not re.match(r'\s*\{|STATUS:', pending) or 'ASK_CUSTOMER' in pending):
            faults.append('answered_for_customer')
            pending = None
        elif s == 'USER':
            pending = None
    return faults


def consent_faults(recs):
    """A committing write must follow a customer message that says yes (the turn that carries it)."""
    faults, last_user = [], ''
    w = dict(writes(recs))
    for i, r in enumerate(recs):
        m = r.get('message')
        if r['record_type'] == 'MESSAGE' and m and m.get('from') == 'USER':
            last_user = m.get('msg') or ''
        if i in w and not re.match(YES_RE, last_user, re.I):
            faults.append(f'wrote_without_confirmation({w[i]})')
    return faults


def score(d):
    sc, recs = d['scenario'], d['records']
    h = hops(recs)
    hs = ' | '.join(h)
    ex = d.get('exit') or {}
    escalated = ex.get('type') == 'escalate'
    heard = ' '.join(t['text'] or '' for t in d['transcript'] if t['who'] == 'agent')
    reached_esc = bool(re.search(rf'{ORCH}->{ESC_RE}', hs))
    loaded = bool(re.search(r'\[Load[ _]Transfer[ _]Data\]', hs))
    used = tools(recs)
    wrote = [f for _, f in writes(recs)]
    sends = f"email={'send_email' in used} sms={'send_confirmation_sms' in used}"
    both = 'send_email' in used and 'send_confirmation_sms' in used

    def handoff(team):
        line = bool(re.search(TEAM_LINES[team], heard, re.I))
        return reached_esc and escalated and loaded and line, \
            f"escalation_agent={reached_esc} transfer={escalated} transfer_data={loaded} {team}_line={line}"

    if sc == 'room_book':
        booked = 'post_reservation' in wrote and bool(re.search(r'WRENLON-[A-Z0-9]{5}', heard))
        ok, why = booked and both, f"booked={booked} {sends}"
    elif sc == 'room_cancel':
        done = said(recs, 'Room Update Agent', r"cancelled (your|the) booking") and 'cancel_reservation' in wrote
        ok, why = done and both, f"cancelled={done} {sends}"
    elif sc == 'room_view':
        ok = said(recs, 'Room Update Agent', r"here's what I have") and bool(re.search(r'WRENLON-', heard))
        why = f"listed={ok}"
    elif sc == 'service':
        done = 'post_service_request' in wrote and said(recs, 'Guest Services Agent', r'ready in your room|arranged that|passed your request')
        ok, why = done and 'send_confirmation_sms' in used, f"logged={done} sms={'send_confirmation_sms' in used}"
    elif sc == 'spa_book':
        booked = 'post_activity_booking' in wrote and bool(re.search(r'\bAB\d{4}\b', heard))
        ok, why = booked and both, f"booked={booked} {sends}"
    elif sc == 'spa_cancel':
        done = said(recs, 'Spa and Wellness Agent', r"cancelled your") and 'cancel_activity_booking' in wrote
        ok, why = done and both, f"cancelled={done} {sends}"
    elif sc == 'club':
        ans = said(recs, 'Club Access Agent', r'club|rooftop|pool') and bool(re.search(r'rooftop|pool|club', heard, re.I))
        ok, why = ans, f"answered={ans}"
    elif sc in ('large_party', 'long_stay', 'room_change'):
        ok, why = handoff('reservations')
        if wrote:
            ok, why = False, why + f' wrote={wrote}'
    elif sc in ('person', 'kb_gap'):
        ok, why = handoff('human_request')
    elif sc == 'lockout':
        # Target design (Crestline): 3 wrong codes -> LOCKED -> identity_verification handoff.
        ok, why = handoff('identity_verification')
        if wrote:
            ok, why = False, why + f' wrote={wrote}'
    else:  # probe:<text>
        first = sc[6:].lower()
        first_hop = next((x for x in h if x.startswith(f'{ORCH}->') and not x.endswith('USER')), None)
        if 'my bookings' in first:  # generic wording -> the room-or-spa clarifier, no routing yet
            asked = bool(re.search(r'room booking, or a spa appointment', heard, re.I))
            ok, why = asked and not first_hop, f"clarifier={asked} first hop {first_hop or 'none'}"
        elif 'cecconi' in first or 'restaurant' in first:  # fixed deflection, no routing
            line = bool(re.search(r'restaurant reservations team', heard, re.I))
            ok, why = line and not first_hop, f"deflection={line} first hop {first_hop or 'none'}"
        else:
            want = next((v for k, v in PROBE_WANT if k in first), None)
            target = first_hop.split('->', 1)[1] if first_hop else ''
            right = bool(want and (re.fullmatch(want, target) or target == AUTH))
            ok, why = right, f"first hop {first_hop or 'none (answered customer)'}; want {want}"
    faults = relay_faults(recs) + consent_faults(recs)
    # Every transfer goes through the escalation agent and its Load Transfer Data brief.
    if escalated and not (reached_esc and loaded):
        faults.append('transfer_without_escalation_agent')
    # A probe that did not ask for a person must not end in a transfer.
    if escalated and sc.startswith('probe:') and not re.search(r'speak to|person', sc, re.I):
        faults.append('unrequested_transfer')
    if faults:
        ok, why = False, why + '; ' + ', '.join(sorted(set(faults)))
    if re.search(r'cannot handle your request', heard, re.I):
        ok, why = False, why + '; platform fallback "Sorry..."'
    if ex.get('type') == 'timeout':
        ok, why = False, why + '; timeout'
    return ok, why, hs


if __name__ == '__main__':
    npass = 0
    for f in sys.argv[1:]:
        d = json.load(open(f))
        ok, why, hs = score(d)
        npass += ok
        print(f"{'PASS' if ok else 'FAIL'}  {f.split('/')[-1]:<26} {d['interactionId'][:8]}  {why}")
        print('      ', hs[:900])
    print(f'{npass}/{len(sys.argv) - 1} passed')
