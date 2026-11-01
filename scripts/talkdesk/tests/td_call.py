"""Summarise Databricks call files pulled by td_dbx.ts: per call, the agent, the conversation
messages it saw (big platform/instruction blocks shown by size only) and the tool it chose.
Files are numbered newest first; this prints oldest first.

Usage: python3 -I td_call.py <dbx dir> [--full N]   (--full N: print call N's messages untruncated)
"""
import glob, json, os, sys

BIG = 3000  # system/developer blocks longer than this are shown by size only


def messages(d):
    def find(o):
        if isinstance(o, dict):
            if isinstance(o.get('messages'), list):
                return o['messages']
            for v in o.values():
                r = find(v)
                if r:
                    return r
        elif isinstance(o, list):
            for x in o:
                r = find(x)
                if r:
                    return r
    return find(d.get('parameters', d)) or []


def text(m):
    c = m.get('content')
    return c if isinstance(c, str) else json.dumps(c) if c else ''


def choice(d):
    try:
        msg = d['response']['choices'][0]['message']
    except (KeyError, IndexError, TypeError):
        return '(no response)'
    calls = msg.get('tool_calls') or []
    return ' + '.join(f"{c['function']['name']}({c['function']['arguments']})" for c in calls) or text(msg)


def main():
    folder = sys.argv[1]
    full = int(sys.argv[sys.argv.index('--full') + 1]) if '--full' in sys.argv else None
    files = sorted(glob.glob(os.path.join(folder, '*.json')), reverse=True)
    for f in files:
        n = int(os.path.basename(f).split('_')[0])
        d = json.load(open(f))
        ms = messages(d)
        kind = os.path.basename(f)[4:].replace('_prompt.json', '')
        print(f"\n######## call {n:03d} {kind}  ({len(ms)} messages)")
        for i, m in enumerate(ms):
            t, role = text(m), m.get('role')
            tc = m.get('tool_calls')
            if role in ('system', 'developer') and len(t) > BIG and full != n:
                print(f"  [{i}] {role} <{len(t):,} chars> {t[:70]!r}")
                continue
            body = t if full == n else t[:700]
            if tc:
                body += ' TOOL_CALLS ' + json.dumps([[c['function']['name'], c['function']['arguments']] for c in tc])[:700]
            print(f"  [{i}] {role}: {body}")
        print(f"  => {choice(d)[:900]}")


if __name__ == '__main__':
    main()
