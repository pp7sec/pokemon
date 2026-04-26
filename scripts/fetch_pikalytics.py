#!/usr/bin/env python3
"""
Fetch Pikalytics VGC Champions tournament data → smogon_vgc.json
Pikalytics explicitly provides /ai/ endpoints for programmatic access
(see robots.txt and llms.txt on their site).
"""
import re, json, time, urllib.request, urllib.error
from datetime import datetime, timezone

FORMAT = "championstournaments"
BASE   = f"https://pikalytics.com/ai/pokedex/{FORMAT}"
UA     = "competitive-pokemon-stats/1.0 (+https://github.com/pp7sec/pokemon)"

def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def parse_index(text):
    """Extract Pokemon → usage % from the markdown table in the index page."""
    usage = {}
    skip = {"pokemon", "rank", "usage", "web page", "ai data"}
    clean = text.replace("**", "")   # strip bold markers
    for m in re.finditer(r'\|\s*\d+\s*\|\s*([\w][\w\s\-\'\.]*?)\s*\|\s*([\d.]+)%', clean):
        name = m.group(1).strip()
        pct  = round(float(m.group(2)), 2)
        if name.lower() not in skip:
            usage[name] = pct
    return usage

def extract_pcts(block):
    """Find all 'Name: XX.XX%' and 'Name (XX.XX%)' in a text block.
    Strips markdown bold markers (**) before matching."""
    clean = block.replace("**", "")
    out = {}
    skip = {"usage", "rank", "total", "bst", "gen", "vgc", "format", "game",
            "category", "data date", "standard web page", "ai data"}
    for m in re.finditer(r'([\w][\w\s\-\'\.]*?):\s*([\d]+\.[\d]+)%', clean):
        name = m.group(1).strip()
        if name.lower() not in skip and len(name) > 1:
            out[name] = round(float(m.group(2)), 2)
    for m in re.finditer(r'([\w][\w\s\-\'\.]+?)\s*\(([\d]+\.[\d]+)%\)', clean):
        name = m.group(1).strip()
        if name.lower() not in skip and len(name) > 1:
            out.setdefault(name, round(float(m.group(2)), 2))
    return out

def parse_detail(text):
    """Parse moves / abilities / items sections from markdown detail page."""
    result = {"moves": {}, "abilities": {}, "items": {}}
    SECTION_MAP = {"move": "moves", "abilit": "abilities", "item": "items"}
    current = None
    buf = []

    def flush():
        if current and buf:
            result[current].update(extract_pcts("\n".join(buf)))

    for line in text.splitlines():
        h = re.match(r'^##\s+(.*)', line.strip())
        if h:
            flush()
            header = h.group(1).lower()
            current = next((v for k, v in SECTION_MAP.items() if k in header), None)
            buf = []
        elif current:
            buf.append(line)

    flush()
    return result

def main():
    print(f"Fetching Pikalytics /{FORMAT} index…")
    index_text = fetch(BASE)
    usage = parse_index(index_text)
    print(f"  {len(usage)} Pokémon found")

    pokemon_data = {}
    names = list(usage.keys())

    for i, name in enumerate(names, 1):
        url_name = name.replace(" ", "-")
        url = f"{BASE}/{url_name}"
        print(f"  [{i:2}/{len(names)}] {name}…", end=" ", flush=True)
        try:
            text = fetch(url)
            detail = parse_detail(text)
            print(f"{len(detail['moves'])} moves, {len(detail['abilities'])} abilities")
        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code}")
            detail = {"moves": {}, "abilities": {}, "items": {}}
        except Exception as e:
            print(f"ERR {e}")
            detail = {"moves": {}, "abilities": {}, "items": {}}

        pokemon_data[name] = {"usage": usage[name], **detail}
        time.sleep(0.5)   # polite delay between requests

    output = {
        "meta": {
            "source": "pikalytics",
            "format": FORMAT,
            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
        "pokemon": pokemon_data,
    }

    with open("smogon_vgc.json", "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)

    print(f"\nDone — smogon_vgc.json ({len(pokemon_data)} Pokémon)")

if __name__ == "__main__":
    main()
