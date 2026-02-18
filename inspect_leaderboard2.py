import requests
import json

resp = requests.get("https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", timeout=10)
data = resp.json()

rows = data.get('leaderboardRows', data if isinstance(data, list) else [])
print(f"Total rows: {len(rows)}")
if rows:
    print(f"\nFirst row:\n{json.dumps(rows[0], indent=2)}")
    print(f"\nSecond row:\n{json.dumps(rows[1], indent=2)}")
