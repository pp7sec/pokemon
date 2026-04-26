#!/usr/bin/env python3
"""
Merge missing_pokemon_stats.csv into PokemonStats.csv.
Rows from missing get an empty ID column; everything else stays the same.
"""
import csv
from pathlib import Path

root = Path(__file__).parent.parent
main_path    = root / "PokemonStats.csv"
missing_path = root / "missing_pokemon_stats.csv"

FIELDS = ["ID","Name","Total","HP","Attack","Defense","SpAtk","SpDef",
          "Speed","Type1","Type2","Height","Weight"]

with open(main_path, newline="", encoding="utf-8") as f:
    main_rows = list(csv.DictReader(f))

with open(missing_path, newline="", encoding="utf-8") as f:
    missing_rows = list(csv.DictReader(f))

# Check for name collisions
main_names = {r["Name"].lower() for r in main_rows}
added, skipped = 0, 0
extra_rows = []
for r in missing_rows:
    if r["Name"].lower() in main_names:
        print(f"  SKIP (already exists): {r['Name']}")
        skipped += 1
    else:
        extra_rows.append({"ID": "", **r})
        added += 1

all_rows = main_rows + extra_rows

with open(main_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_MINIMAL)
    writer.writeheader()
    writer.writerows(all_rows)

print(f"Done — PokemonStats.csv now has {len(all_rows)} rows "
      f"(+{added} added, {skipped} skipped)")
