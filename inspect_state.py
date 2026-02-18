import requests
import json

# Get a whale address from leaderboard
resp = requests.get("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", timeout=10)
data = resp.json()
rows = data.get('leaderboardRows', [])
whales = [r for r in rows if float(r.get('accountValue', 0)) >= 2_500_000]

addr = whales[0]['ethAddress']
print(f"Testing address: {addr}")

# Get clearinghouse state
resp2 = requests.post(
    "https://api.hyperliquid.xyz/info",
    json={"type": "clearinghouseState", "user": addr},
    headers={"Content-Type": "application/json"},
    timeout=10
)
state = resp2.json()

# Print full structure
print("\n=== marginSummary ===")
print(json.dumps(state.get('marginSummary', {}), indent=2))

print("\n=== crossMarginSummary ===")
print(json.dumps(state.get('crossMarginSummary', {}), indent=2))

print("\n=== First position (full) ===")
positions = [p for p in state.get('assetPositions', []) if float(p['position']['szi']) != 0]
if positions:
    print(json.dumps(positions[0], indent=2))
    if len(positions) > 1:
        print("\n=== Second position (full) ===")
        print(json.dumps(positions[1], indent=2))
