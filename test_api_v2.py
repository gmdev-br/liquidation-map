import requests
import json

url = "https://api.hyperliquid.xyz/info"
headers = {"Content-Type": "application/json"}

# Try various combinations
payloads = [
    {"type": "leaderboard"},
    {"type": "mainnetLeaderboard"},
    {"type": "leaderboard", "window": "1w"},
    {"type": "leaderboard", "period": "allTime"},
    {"type": "leaderboard", "period": "day"},
    {"type": "referralLeaderboard"},
    {"type": "metaAndAssetCtxs"}, # To confirm connection
    {"type": "frontendMeta"}
]

for p in payloads:
    try:
        resp = requests.post(url, json=p, headers=headers)
        if resp.status_code == 200:
            print(f"SUCCESS: {json.dumps(p)} -> {str(resp.json())[:50]}...")
        else:
            print(f"FAILED: {json.dumps(p)} -> {resp.status_code}")
    except Exception as e:
        print(f"EXCEPTION: {json.dumps(p)} -> {str(e)}")
