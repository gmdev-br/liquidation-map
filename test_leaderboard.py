import requests
import json

headers = {"Content-Type": "application/json"}

# Test various leaderboard endpoints
tests = [
    # Hyperliquid stats API (different base URL)
    ("GET", "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", None),
    ("GET", "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard?timeWindow=allTime", None),
    # Hyperliquid app API
    ("GET", "https://api.hyperliquid.xyz/leaderboard", None),
    # Info endpoint with leaderboard type variants
    ("POST", "https://api.hyperliquid.xyz/info", {"type": "leaderboard", "window": "allTime"}),
    ("POST", "https://api.hyperliquid.xyz/info", {"type": "leaderboard", "window": "day"}),
    ("POST", "https://api.hyperliquid.xyz/info", {"type": "leaderboard", "window": "week"}),
    ("POST", "https://api.hyperliquid.xyz/info", {"type": "leaderboard", "window": "month"}),
]

for method, url, payload in tests:
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, timeout=5)
        else:
            resp = requests.post(url, json=payload, headers=headers, timeout=5)
        
        status = resp.status_code
        if status == 200:
            data = resp.json()
            if isinstance(data, list):
                print(f"SUCCESS [{method}] {url} -> list of {len(data)} items")
                if len(data) > 0:
                    print(f"  First item keys: {list(data[0].keys()) if isinstance(data[0], dict) else data[0]}")
            elif isinstance(data, dict):
                print(f"SUCCESS [{method}] {url} -> dict keys: {list(data.keys())[:5]}")
            else:
                print(f"SUCCESS [{method}] {url} -> {str(data)[:100]}")
        else:
            print(f"FAILED [{method}] {url} -> {status}: {resp.text[:80]}")
    except Exception as e:
        print(f"ERROR [{method}] {url} -> {str(e)[:80]}")
