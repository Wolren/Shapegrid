#!/usr/bin/env python3
"""Download and process world-atlas TopoJSON into a compact countries format."""
import json, urllib.request, sys
from pathlib import Path

# Repo root (two levels up from scripts/)
REPO_ROOT = Path(__file__).resolve().parent.parent

# Download the 110m countries TopoJSON
print("Downloading world-atlas countries-110m.json...")
url = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
with urllib.request.urlopen(url) as f:
    topo = json.load(f)

print(f"TopoJSON objects: {list(topo['objects'].keys())}")

# FeatureCollection of countries
countries = topo['objects']['countries']
geometries = countries['geometries']
print(f"Number of country geometries: {len(geometries)}")
print(f"First geometry keys: {list(geometries[0].keys())}")
print(f"First geometry id: {geometries[0]['id']}, type: {geometries[0]['type']}")
print(f"Properties: {geometries[0].get('properties', 'NONE')}")

# The world-atlas uses numeric ISO 3166-1 numeric codes as IDs
# We need to map these to alpha-2 codes
# Let's check a few IDs
sample_ids = [g['id'] for g in geometries[:10]]
print(f"Sample IDs: {sample_ids}")

# Check if there's a name lookup available
try:
    name_url = "https://cdn.jsdelivr.net/npm/world-atlas@2/names.json"
    with urllib.request.urlopen(name_url) as f:
        names = json.load(f)
    print(f"\nNames file has {len(names)} entries")
    print(f"Sample entries: {list(names.items())[:3]}")
except:
    print("No names.json available")

# Save the raw TopoJSON structure info
print("\nSaving structure info...")
with open(REPO_ROOT / 'web' / 'src' / 'data' / 'topo-info.json', 'w') as f:
    json.dump({
        'object_keys': list(topo['objects'].keys()),
        'num_geometries': len(geometries),
        'sample_geometries': [
            {k: v for k, v in g.items() if k != 'arcs'}
            for g in geometries[:3]
        ]
    }, f, indent=2)

print("Done. Saved to topo-info.json")
