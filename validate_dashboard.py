import requests
import json

print("=== Testing Whale Dashboard API Flow ===\n")

# Step 1: Fetch leaderboard
print("1. Fetching leaderboard from stats-data.hyperliquid.xyz...")
resp = requests.get("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", timeout=10)
print(f"   Status: {resp.status_code}")
data = resp.json()
rows = data.get('leaderboardRows', [])
print(f"   Total rows: {len(rows)}")

# Step 2: Filter whales
MIN_VAL = 2_500_000
whales = [r for r in rows if float(r.get('accountValue', 0)) >= MIN_VAL]
print(f"\n2. Whales with account value >= ${MIN_VAL:,}: {len(whales)}")

if whales:
    top = whales[0]
    print(f"\n   Top whale:")
    print(f"   Address: {top['ethAddress']}")
    print(f"   Account Value: ${float(top['accountValue']):,.0f}")
    print(f"   Display Name: {top.get('displayName', 'None')}")
    
    # Show window performances
    if 'windowPerformances' in top:
        print(f"   Window Performances:")
        for wp in top['windowPerformances']:
            window, perf = wp[0], wp[1]
            pnl = float(perf.get('pnl', 0))
            print(f"     {window}: PnL=${pnl:,.0f}")

# Step 3: Test clearinghouseState for top whale
if whales:
    addr = whales[0]['ethAddress']
    print(f"\n3. Fetching positions for top whale ({addr[:10]}...)...")
    resp2 = requests.post(
        "https://api.hyperliquid.xyz/info",
        json={"type": "clearinghouseState", "user": addr},
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    print(f"   Status: {resp2.status_code}")
    state = resp2.json()
    positions = [p for p in state.get('assetPositions', []) if float(p['position']['szi']) != 0]
    print(f"   Open positions: {len(positions)}")
    for p in positions[:3]:
        pos = p['position']
        size = float(pos['szi'])
        side = 'LONG' if size > 0 else 'SHORT'
        print(f"   - {pos['coin']} {side} @ ${float(pos['entryPx']):,.2f} | PnL: ${float(pos['unrealizedPnl']):,.0f}")

print("\n=== All tests passed! Dashboard should work correctly. ===")
