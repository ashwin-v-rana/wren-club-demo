#!/usr/bin/env python3
"""
verify_export.py — pre-commit check for the Talkdesk export JSON.

Checks two things:
  1. DRIFT: every agent's `instruction` (and the Orchestrator's `routing_condition`)
     in the export JSON matches the corresponding block in its talkdesk/*.md file.
  2. SECRETS: the JSON contains no obviously sensitive material (tokens, keys,
     bearer headers, real-looking phone numbers outside the seeded demo range).

Usage:
  python3 scripts/verify_export.py talkdesk/export/wren-club-ai-agent.json

Conventions it relies on:
  - Each .md file contains the deployable text between a '## INSTRUCTION' header
    and the next '---' divider (and '## routing_condition' for the Orchestrator).
  - AGENT_FILE_MAP below maps Talkdesk agent_name -> md file. Update it when
    agents are added or renamed (routing target strings must match exactly).

Exit code 0 = clean; 1 = drift or suspected secret found.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

AGENT_FILE_MAP = {
    "Wren Concierge": REPO / "talkdesk" / "orchestrator.md",
    "Authentication Agent": REPO / "talkdesk" / "agents" / "auth-agent.md",
    "Club Access Agent": REPO / "talkdesk" / "agents" / "club-access-agent.md",
    "Room Reservation Agent": REPO / "talkdesk" / "agents" / "room-reservation-agent.md",
    "Room Update Agent": REPO / "talkdesk" / "agents" / "room-update-agent.md",
    "Spa and Wellness Agent": REPO / "talkdesk" / "agents" / "spa-wellness-agent.md",  # no "&" — Talkdesk rejects it in the name
    "Guest Services Agent": REPO / "talkdesk" / "agents" / "guest-services-agent.md",
    # "Concierge Agent": REPO / "talkdesk" / "agents" / "concierge-agent.md",  # not yet built (pending venue content)
}

SECRET_PATTERNS = [
    (r"(?i)bearer\s+[a-z0-9_\-\.]{16,}", "Bearer token"),
    (r"(?i)(api[_-]?key|secret|password|service_role)\"?\s*[:=]\s*\"?[a-z0-9]", "Key/secret assignment"),
    (r"eyJ[A-Za-z0-9_\-]{20,}\.eyJ", "JWT (Supabase keys are JWTs)"),
    (r"sk-[A-Za-z0-9]{20,}", "sk- style API key"),
    # UK numbers outside the Ofcom fictional drama range 07700 900xxx used by our personas:
    (r"\+447(?!700900)\d{8}", "Non-fictional UK phone number"),
]


def extract_block(md_text: str, header: str) -> str:
    """Text between `## {header}` and the next '---' line, trimmed."""
    m = re.search(rf"^## {re.escape(header)}.*?$", md_text, re.M)
    if not m:
        return ""
    rest = md_text[m.end():]
    end = re.search(r"^---\s*$", rest, re.M)
    block = rest[: end.start()] if end else rest
    return block.strip()


def norm(s: str) -> str:
    """Normalize for comparison: unify line endings, strip trailing spaces,
    collapse the copy-paste-vulnerable characters (smart quotes, nbsp)."""
    s = s.replace("\r\n", "\n").replace("\u00a0", " ")
    s = s.replace("\u2018", "'").replace("\u2019", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    return "\n".join(line.rstrip() for line in s.strip().split("\n"))


def main(export_path: str) -> int:
    data = json.loads(Path(export_path).read_text(encoding="utf-8"))
    raw = Path(export_path).read_text(encoding="utf-8")
    failures = 0

    # ---- 1. Secrets scan (whole file) ----
    for pattern, label in SECRET_PATTERNS:
        for m in re.finditer(pattern, raw):
            print(f"SECRET? {label}: ...{raw[max(0, m.start()-30):m.end()+10]!r}...")
            failures += 1

    # ---- 2. Drift check per agent ----
    agents = {a.get("agent_name", "?"): a for a in data.get("agents", [])}

    for name, md_path in AGENT_FILE_MAP.items():
        if name not in agents:
            print(f"MISSING: agent {name!r} not in export (not yet built, or renamed?)")
            failures += 1
            continue
        if not md_path.exists():
            print(f"MISSING: {md_path} not found for agent {name!r}")
            failures += 1
            continue

        md = md_path.read_text(encoding="utf-8")
        want = norm(extract_block(md, "INSTRUCTION"))
        got = norm(agents[name].get("instruction", ""))
        if want != got:
            print(f"DRIFT: {name!r} instruction differs from {md_path.name} "
                  f"(md {len(want)} chars vs export {len(got)} chars)")
            failures += 1

        rc_want = extract_block(md, "routing_condition")
        if rc_want:
            # md block includes a lead-in line before the routable list; compare
            # from the first routing target onward.
            anchor = rc_want.find("Authentication Agent")
            rc_want = norm(rc_want[anchor:]) if anchor >= 0 else norm(rc_want)
            rc_got = norm(agents[name].get("routing_condition", ""))
            if rc_want != rc_got:
                print(f"DRIFT: {name!r} routing_condition differs from {md_path.name} "
                      f"(md {len(rc_want)} chars vs export {len(rc_got)} chars)")
                failures += 1

    unmapped = set(agents) - set(AGENT_FILE_MAP)
    for name in sorted(unmapped):
        print(f"UNMAPPED: export contains agent {name!r} with no md file in AGENT_FILE_MAP")
        failures += 1

    print("CLEAN" if failures == 0 else f"{failures} issue(s) found")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
