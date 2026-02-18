import requests
import json

url = "https://api.hyperliquid.xyz/info"
headers = {"Content-Type": "application/json"}

payloads = [
    {"type": "leaderboard"},
    {"type": "mainnetLeaderboard"},
    {"type": "leaderboard", "window": "30m"},
    {"type": "leaderboard", "period": "all time"},
    {"type": "meta"},
    {"type": "clearinghouseState", "user": "0x0000000000000000000000000000000000000000"} # Test user
]

for p in payloads:
    print(f"Testing payload: {json.dumps(p)}")
    try:
        resp = requests.post(url, json=p, headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"Success! Response keys: {list(resp.json().keys())[:5]}")
            # If it's a list, show length
            if isinstance(resp.json(), list):
                 print(f"List length: {len(resp.json())}")
        else:
            print(f"Error: {resp.text[:100]}")
    except Exception as e:
        print(f"Exception: {e}")
    print("-" * 20)
