import requests
import json

url = "https://api.hyperliquid.xyz/info"
headers = {"Content-Type": "application/json"}

# Found from exploreres or docs
REAL_ADDRESS = "0xdfc71796205b721a37a19ff212903e1c6ae78a16" # Just a random guess or well known address if I can find one. 
# Attempting to use a burn address or common address might fail validation.
# Let's use a very likely valid address format.

payloads = [
    {"type": "meta"}, 
    {"type": "allMids"},
    {"type": "userState", "user": "0x0000000000000000000000000000000000000000"},
    {"type": "clearinghouseState", "user": "0x23f7c32e541620a562479f665511b02660505b82"}, # A valid looking address (from a random eth scan, hope it exists on hyperliquid)
    {"type": "spotMeta"},
    {"type": "spotClearinghouseState", "user": "0x23f7c32e541620a562479f665511b02660505b82"},
    {"type": "referral", "user": "0x23f7c32e541620a562479f665511b02660505b82"},
]

for p in payloads:
    try:
        resp = requests.post(url, json=p, headers=headers)
        if resp.status_code == 200:
             print(f"SUCCESS: {json.dumps(p)} -> {str(resp.json())[:50]}...")
        else:
            print(f"FAILED: {json.dumps(p)} -> {resp.status_code} {resp.text[:50]}")
    except Exception as e:
        print(f"EXCEPTION: {json.dumps(p)} -> {str(e)}")
