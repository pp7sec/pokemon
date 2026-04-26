#!/usr/bin/env python3
"""Fetch and parse Smogon VGC usage stats → smogon_vgc.json"""
import re, json, urllib.request, urllib.error
from datetime import datetime, timedelta

BASE = "https://www.smogon.com/stats"

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "smogon-fetcher/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")

def latest_month_with_vgc():
    """Walk backwards month by month until we find VGC moveset data."""
    d = datetime.utcnow().replace(day=1)
    for _ in range(6):
        month = d.strftime("%Y-%m")
        try:
            html = fetch(f"{BASE}/{month}/moveset/", timeout=15)
            if "vgc" in html.lower():
                return month, html
        except urllib.error.URLError:
            pass
        d = (d - timedelta(days=1)).replace(day=1)
    raise RuntimeError("No VGC data found in the last 6 months")

def pick_format(index_html):
    """Pick the main (non-bo3) VGC format with the highest regulation."""
    hits = re.findall(r'(gen9vgc(\d{4})reg([a-z]+))-0\.txt', index_html)
    if not hits:
        raise RuntimeError("No gen9vgc format found")
    # sort by year desc, then regulation desc; exclude bo3
    hits = [h for h in hits if "bo3" not in h[0]]
    hits.sort(key=lambda x: (x[1], x[2]), reverse=True)
    return hits[0][0]

def parse_usage(text):
    """Overall usage % and battle count from the main stats file."""
    usage, battles = {}, 0
    for line in text.splitlines():
        m = re.match(r"Total battles:\s*(\d+)", line)
        if m:
            battles = int(m.group(1))
        m = re.match(r"\|\s*\d+\s*\|\s*(.*?)\s*\|\s*([\d.]+)%", line)
        if m:
            usage[m.group(1).strip()] = round(float(m.group(2)), 2)
    return usage, battles

def parse_moveset(text):
    """Per-Pokemon abilities / moves / items with usage %."""
    SECTIONS = {"Abilities", "Items", "Spreads", "Moves", "Teammates",
                "Tera Types", "Checks and Counters"}
    result, pokemon, section, after_sep = {}, None, None, False

    for line in text.splitlines():
        s = line.strip()
        if re.match(r"^\+[-+]+\+$", s):
            after_sep = True
            continue

        if after_sep:
            after_sep = False
            m = re.match(r"^\|\s*(.*?)\s*\|$", s)
            if not m:
                continue
            content = m.group(1).strip()
            if content in SECTIONS:
                section = content
            elif content and not re.match(r"^(Raw count|Avg\.|Viability)", content):
                pokemon = content
                section = None
                result.setdefault(pokemon, {"abilities": {}, "moves": {}, "items": {}})
            continue

        if pokemon and section in ("Abilities", "Moves", "Items") and s.startswith("|"):
            m = re.match(r"^\|\s*(.*?)\s*\|\s*([\d.]+)%\s*\|", s)
            if m:
                name, pct = m.group(1).strip(), round(float(m.group(2)), 2)
                if name:
                    key = {"Abilities": "abilities", "Moves": "moves", "Items": "items"}[section]
                    result[pokemon][key][name] = pct

    return result

def main():
    print("Finding latest VGC month…")
    month, index_html = latest_month_with_vgc()
    fmt = pick_format(index_html)
    print(f"  Month: {month}  Format: {fmt}")

    usage_url   = f"{BASE}/{month}/{fmt}-0.txt"
    moveset_url = f"{BASE}/{month}/moveset/{fmt}-0.txt"

    print(f"  Fetching usage…")
    usage, battles = parse_usage(fetch(usage_url))
    print(f"  {len(usage)} Pokémon, {battles} battles")

    print(f"  Fetching movesets…")
    movesets = parse_moveset(fetch(moveset_url))
    print(f"  {len(movesets)} Pokémon movesets")

    all_names = set(usage) | set(movesets)
    pokemon_data = {}
    for name in all_names:
        entry = movesets.get(name, {"abilities": {}, "moves": {}, "items": {}})
        entry["usage"] = usage.get(name, 0.0)
        pokemon_data[name] = entry

    output = {
        "meta": {"format": fmt, "month": month, "battles": battles},
        "pokemon": pokemon_data,
    }

    out = "smogon_vgc.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  Saved {out}  ({len(pokemon_data)} Pokémon)")

if __name__ == "__main__":
    main()
