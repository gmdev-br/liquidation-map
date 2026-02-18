import requests
import json

# Get leaderboard from the correct endpoint
resp = requests.get("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", timeout=10)
print(f"Status: {resp.status_code}")
data = resp.json()

if isinstance(data, list):
    print(f"Total entries: {len(data)}")
    if len(data) > 0:
        print(f"\nFirst entry keys: {list(data[0].keys())}")
        print(f"\nFirst entry sample:\n{json.dumps(data[0], indent=2)}")
elif isinstance(data, dict):
    print(f"Dict keys: {list(data.keys())}")
    # Show first level
    for k, v in data.items():
        if isinstance(v, list) and len(v) > 0:
            print(f"\n{k} (list of {len(v)}):")
            print(f"  First item: {json.dumps(v[0], indent=2)}")
        else:
            print(f"\n{k}: {str(v)[:200]}")
