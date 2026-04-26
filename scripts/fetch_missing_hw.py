#!/usr/bin/env python3
"""
Fetch Height & Weight from PokeAPI for every row in missing_pokemon_stats.csv
and rewrite the file with those two columns added.
"""
import csv, re, json, time, urllib.request, urllib.error, sys
from pathlib import Path

# ── Manual overrides for names that can't be auto-converted ──────────────────
SLUG_OVERRIDES = {
    "Tauros Paldean":  "tauros-paldea-combat-breed",
    "Basculegion":     "basculegion-male",
    "Maushold":        "maushold-family-of-four",
    "Meowstic":        "meowstic-male",
    "Aegislash":       "aegislash-shield",
    "Gourgeist":       "gourgeist-average",
    "Lycanroc":        "lycanroc-midday",
    "Morpeko":         "morpeko-full-belly",
    "Palafin":         "palafin-zero",
}

def name_to_slug(name: str) -> str:
    if name in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[name]

    # "Mega Charizard X" / "Mega Charizard Y"
    m = re.match(r'^Mega (.+) ([XY])$', name)
    if m:
        return f"{m.group(1).lower().replace(' ', '-')}-mega-{m.group(2).lower()}"

    # "Mega Pokémon"
    if name.startswith("Mega "):
        base = name[5:].lower().replace(" ", "-")
        return f"{base}-mega"

    # Regional forms
    for word, suffix in [("Alolan", "alola"), ("Galarian", "galar"),
                         ("Hisuian", "hisui"), ("Paldean", "paldea")]:
        if name.endswith(f" {word}"):
            base = name[:-(len(word) + 1)].lower().replace(" ", "-")
            return f"{base}-{suffix}"

    return name.lower().replace(" ", "-")


def fetch_hw(slug: str):
    """Return (height_m, weight_kg) or (None, None) on failure."""
    url = f"https://pokeapi.co/api/v2/pokemon/{slug}/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "pokemon-hw-fetcher/1.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read())
        # PokeAPI: height in decimetres, weight in hectograms
        return round(d["height"] / 10, 1), round(d["weight"] / 10, 1)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}", file=sys.stderr)
        return None, None
    except Exception as e:
        print(f"  ERR {e}", file=sys.stderr)
        return None, None


def main():
    csv_path = Path(__file__).parent.parent / "missing_pokemon_stats.csv"

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    updated = []
    for row in rows:
        name = row["Name"].strip('"')
        slug = name_to_slug(name)
        print(f"  {name:35s} → {slug:40s} ", end="", flush=True)
        h, w = fetch_hw(slug)
        if h is not None:
            print(f"{h} m  {w} kg")
        else:
            print("NOT FOUND — left blank")
        row["Height"] = h if h is not None else ""
        row["Weight"] = w if w is not None else ""
        updated.append(row)
        time.sleep(0.3)

    # Write back with Height + Weight columns after Speed
    fieldnames = ["Name","Total","HP","Attack","Defense","SpAtk","SpDef","Speed",
                  "Type1","Type2","Height","Weight"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(updated)

    print(f"\nDone — {csv_path.name} updated ({len(updated)} rows)")


if __name__ == "__main__":
    main()
